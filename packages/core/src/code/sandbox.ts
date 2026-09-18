import { createContext, Script } from 'node:vm';
import type { IDataObject, INodeExecutionData } from '@runnel/workflow';

/**
 * Runs user-authored JavaScript for the Code node using Node's built-in `vm` module: a
 * separate V8 context with its own global object, so sandboxed code has no `require`,
 * `process`, `fs`, or access to anything in the host process's global scope unless it's
 * explicitly assigned into the context below.
 *
 * IMPORTANT — this is NOT the hard security boundary the spec calls for (§9, §12.8). `vm`
 * contexts still run in the *same OS process* as the rest of runnel, and are documented
 * to have known escape vectors (constructor-chain tricks, prototype access). It also cannot
 * enforce a wall-clock timeout on *async* code — `Script.runInContext`'s `timeout` option
 * only bounds synchronous execution; an `await` inside user code suspends past it. Real
 * isolation — a separate process or worker thread that can be killed outright — is the
 * task-runner work explicitly scoped to M12's hardening pass. Do not treat this module as
 * sufficient isolation for untrusted code in production.
 */
export type CodeExecutionMode = 'runOnceForAllItems' | 'runOnceForEachItem';

export interface IRunCodeOptions {
  code: string;
  mode: CodeExecutionMode;
  items: INodeExecutionData[];
  /** Best-effort wall-clock budget; see the module-level caveat about async code above. */
  timeoutMs?: number;
}

interface IInputAccessor {
  all: () => INodeExecutionData[];
  first: () => INodeExecutionData | undefined;
  last: () => INodeExecutionData | undefined;
  item?: INodeExecutionData;
}

function makeInputAccessor(items: INodeExecutionData[], currentIndex?: number): IInputAccessor {
  return {
    all: () => items,
    first: () => items[0],
    last: () => items[items.length - 1],
    item: currentIndex === undefined ? undefined : items[currentIndex],
  };
}

async function runInSandbox(code: string, globals: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
  const context = createContext({ console, Buffer, Math, Date, JSON, setTimeout, clearTimeout, ...globals });
  const script = new Script(`(async () => {\n${code}\n})()`, { filename: 'Code.vm.js' });

  // Two different mechanisms can time this out: vm's own synchronous `timeout` (which fires for
  // a blocking loop, and also when a busy machine takes too long just to *start* the script) and
  // the wall-clock race below (which covers async code that keeps running). They word their
  // errors differently, so vm's is normalized here — callers get one message either way.
  const normalizeTimeout = (err: unknown): never => {
    // Not `err instanceof Error`: the interrupt can arrive as an error from the vm's own realm,
    // where the host's Error constructor is a different object and instanceof is false.
    const message = typeof (err as { message?: unknown } | null)?.message === 'string' ? (err as { message: string }).message : String(err);
    if (timeoutMs !== undefined && /Script execution timed out/i.test(message)) {
      throw new Error(`Code execution exceeded ${timeoutMs}ms`);
    }
    throw err;
  };

  // vm's interrupt surfaces either as a synchronous throw or as a rejection of the async IIFE's
  // promise, depending on where the script was when the clock ran out — normalize both.
  const execution = Promise.resolve()
    .then(() => script.runInContext(context, { timeout: timeoutMs }) as Promise<unknown>)
    .catch(normalizeTimeout);

  if (!timeoutMs) return execution;

  return Promise.race([
    execution,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Code execution exceeded ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function normalizeItem(entry: unknown, itemIndex: number): INodeExecutionData {
  if (entry !== null && typeof entry === 'object' && 'json' in (entry as object)) {
    return entry as INodeExecutionData;
  }
  return { json: (entry ?? {}) as IDataObject, pairedItem: { item: itemIndex } };
}

export async function runCode(options: IRunCodeOptions): Promise<INodeExecutionData[]> {
  if (options.mode === 'runOnceForAllItems') {
    const result = await runInSandbox(
      options.code,
      { items: options.items, $input: makeInputAccessor(options.items) },
      options.timeoutMs,
    );
    if (!Array.isArray(result)) {
      throw new Error('Code (Run Once for All Items) must return an array of items');
    }
    return result.map((entry, i) => normalizeItem(entry, i));
  }

  const output: INodeExecutionData[] = [];
  for (let i = 0; i < options.items.length; i++) {
    const result = await runInSandbox(
      options.code,
      {
        $json: options.items[i]!.json,
        $input: makeInputAccessor(options.items, i),
        $itemIndex: i,
      },
      options.timeoutMs,
    );
    output.push(normalizeItem(result, i));
  }
  return output;
}
