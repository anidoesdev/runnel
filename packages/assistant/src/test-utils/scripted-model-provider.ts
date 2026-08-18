import type { IModelProvider, IModelToolCallRef, ModelStopReason, ModelStreamEvent } from '../model-provider.js';

export interface IScriptedTurn {
  text?: string;
  toolCalls?: IModelToolCallRef[];
  /** Defaults to 'tool_use' when toolCalls is non-empty, else 'end_turn'. */
  stopReason?: ModelStopReason;
  usage?: { inputTokens: number; outputTokens: number };
}

/** A ModelProvider that plays back a fixed script, one turn per call to stream() — the fake the agent loop's own tests and the Milestone 3 end-to-end test drive instead of a real (network-calling, non-deterministic) OpenAI request. */
export class ScriptedModelProvider implements IModelProvider {
  private turnIndex = 0;

  constructor(private readonly turns: IScriptedTurn[]) {}

  async *stream(): AsyncGenerator<ModelStreamEvent> {
    const turn = this.turns[this.turnIndex];
    this.turnIndex++;
    if (!turn) throw new Error(`ScriptedModelProvider: no scripted turn left (called ${this.turnIndex} times)`);

    if (turn.text) yield { type: 'text_delta', text: turn.text };

    for (const call of turn.toolCalls ?? []) {
      yield { type: 'tool_use_start', id: call.id, name: call.name };
      yield { type: 'tool_use_delta', id: call.id, argumentsDelta: call.arguments };
      yield { type: 'tool_use_end', id: call.id };
    }

    if (turn.usage) yield { type: 'usage', inputTokens: turn.usage.inputTokens, outputTokens: turn.usage.outputTokens };

    yield { type: 'message_stop', stopReason: turn.stopReason ?? ((turn.toolCalls?.length ?? 0) > 0 ? 'tool_use' : 'end_turn') };
  }
}
