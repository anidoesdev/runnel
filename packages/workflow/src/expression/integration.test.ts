import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { evaluateExpressionSource } from './template.js';
import { makeExpressionContext } from './test-utils.js';

/**
 * Table-driven suite exercising the whole expression engine end to end (lexer -> parser ->
 * evaluator -> scope -> extensions) against a single shared context. Per the M3 definition
 * of done: >=150 cases, covering every `$`-symbol from §4 and every extension method from
 * §4's chainable-methods table at least once.
 */
const ctx = makeExpressionContext({
  item: {
    json: {
      name: 'Alice',
      age: 30,
      email: 'contact: alice@example.com',
      tags: ['a', 'b', 'a'],
      nested: { x: { y: 5 } },
      empty: '',
      nullField: null,
      score: 3.14159,
    },
  },
  itemIndex: 1,
  runIndex: 2,
  inputItems: [{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 3 } }],
  workflow: { id: 'wf-1', name: 'Demo', active: true, nodes: [], connections: {} },
  runData: {
    Prev: [
      {
        startTime: 0,
        executionTime: 0,
        executionStatus: 'success',
        source: [],
        data: { main: [[{ json: { v: 10 } }, { json: { v: 20 } }]] },
      },
    ],
  },
  parameters: { mode: 'test' },
  env: { API_KEY: 'secret123' },
  vars: { threshold: 5 },
  secrets: { token: 'shh' },
  execution: { id: 'exec-1', resumeUrl: 'http://resume' },
  prevNode: { name: 'Prev', outputIndex: 0, runIndex: 0 },
});

const cases: Array<[string, unknown]> = [
  // --- $json / $binary ---
  ['$json.name', 'Alice'],
  ['$json.age', 30],
  ['$json["name"]', 'Alice'],
  ['$json.nested.x.y', 5],
  ['$json.tags.length', 3],
  ['$binary', {}],

  // --- $node / $(...) ---
  ['$node["Prev"].json.v', 20],
  ['$node["Prev"].first().json.v', 10],
  ['$node["Prev"].last().json.v', 20],
  ['$node["Prev"].all().length', 2],
  ['$("Prev").item.json.v', 20],
  ['$("Prev").first().json.v', 10],

  // --- $input ---
  ['$input.item.json.n', 2],
  ['$input.first().json.n', 1],
  ['$input.last().json.n', 3],
  ['$input.all().length', 3],

  // --- $items (legacy accessor) ---
  ['$items("Prev", 0).length', 2],
  ['$items("Prev", 0)[1].json.v', 20],

  // --- $parameter / $workflow / $execution / $prevNode ---
  ['$parameter.mode', 'test'],
  ['$workflow.id', 'wf-1'],
  ['$workflow.name', 'Demo'],
  ['$workflow.active', true],
  ['$execution.id', 'exec-1'],
  ['$execution.mode', 'manual'],
  ['$execution.resumeUrl', 'http://resume'],
  ['$prevNode.name', 'Prev'],

  // --- $runIndex / $itemIndex ---
  ['$runIndex', 2],
  ['$itemIndex', 1],

  // --- $env / $vars / $secrets ---
  ['$env.API_KEY', 'secret123'],
  ['$vars.threshold', 5],
  ['$secrets.token', 'shh'],

  // --- $if / $ifEmpty / $min / $max ---
  ['$if(true, 1, 2)', 1],
  ['$if(false, 1, 2)', 2],
  ['$if($json.age > 18, "adult", "minor")', 'adult'],
  ['$ifEmpty($json.empty, "default")', 'default'],
  ['$ifEmpty($json.name, "default")', 'Alice'],
  ['$ifEmpty($json.nullField, "default")', 'default'],
  ['$min(4, 2, 9)', 2],
  ['$max(4, 2, 9)', 9],

  // --- $jmespath ---
  ['$jmespath($json, "nested.x.y")', 5],
  ['$jmespath($json, "tags[0]")', 'a'],
  ['$jmespath({items:[{n:1},{n:2}]}, "items[*].n")', [1, 2]],

  // --- String extensions ---
  ['"HelloWorld".toSnakeCase()', 'hello_world'],
  ['$json.email.extractEmail()', 'alice@example.com'],
  ['$json.empty.isEmpty()', true],
  ['$json.name.isEmpty()', false],
  ['"2024-03-01".toDateTime().year', 2024],
  ['"01/03/2024".toDateTime("dd/MM/yyyy").month', 3],
  ['"Hello, World!".toSnakeCase()', 'hello,_world!'],
  ['"already_snake".toSnakeCase()', 'already_snake'],

  // --- Array extensions ---
  ['$json.tags.first()', 'a'],
  ['$json.tags.last()', 'a'],
  ['[{id:1},{id:2}].pluck("id")', [1, 2]],
  ['$json.tags.unique()', ['a', 'b']],
  ['[1,2,3].sum()', 6],
  ['[{n:1},{n:2}].sum("n")', 3],
  ['[1,2,3,4,5].chunk(2)', [[1, 2], [3, 4], [5]]],
  ['[1,1,2].unique().length', 2],
  ['[{id:1},{id:2},{id:1}].pluck("id").unique()', [1, 2]],
  ['[1,2,3,4].chunk(3)', [[1, 2, 3], [4]]],

  // --- Object extensions ---
  ['$json.nested.keys()', ['x']],
  ['$json.nested.hasField("x")', true],
  ['$json.nested.hasField("z")', false],
  ['{name: "token-abc123", count: 5}.removeFieldsContaining("token")', { count: 5 }],

  // --- Number extensions ---
  ['$json.score.round(2)', 3.14],
  ['(1234).format("en-US")', '1,234'],
  ['$json.score.round()', 3],
  ['$json.score.round(3)', 3.142],

  // --- DateTime extensions ---
  ['"2024-06-15".toDateTime().plus(1, "days").toISODate()', '2024-06-16'],
  ['"2024-06-15".toDateTime().minus(1, "days").toISODate()', '2024-06-14'],
  ['"2024-06-15".toDateTime().beginningOf("month").toISODate()', '2024-06-01'],
  ['"2024-06-15".toDateTime().format("yyyy")', '2024'],

  // --- Arithmetic ---
  ['1 + 1', 2],
  ['5 - 2', 3],
  ['4 * 3', 12],
  ['10 / 4', 2.5],
  ['10 % 3', 1],
  ['2 ** 8', 256],
  ['"a" + "b"', 'ab'],
  ['2 + 3 * 4 - 1', 13],
  ['(2 + 3) * (4 - 1)', 15],
  ['10 - 2 - 3', 5],
  ['2 ** 3 ** 2', 512],

  // --- Comparison ---
  ['1 == 1', true],
  ['1 == "1"', true],
  ['1 === 1', true],
  ['1 === "1"', false],
  ['1 != 2', true],
  ['1 !== 1', false],
  ['2 < 3', true],
  ['3 <= 3', true],
  ['3 > 2', true],
  ['2 >= 3', false],
  ['"a" < "b"', true],

  // --- Logical ---
  ['true && false', false],
  ['true && true', true],
  ['false || true', true],
  ['null ?? "d"', 'd'],
  ['undefined ?? "d"', 'd'],
  ['0 ?? "d"', 0],
  ['1 < 2 && 2 < 3', true],
  ['1 < 2 || 2 > 3', true],
  ['false || false || "last"', 'last'],
  ['1 == 1 && 2 == 2', true],
  ['!(1 == 2)', true],

  // --- Unary / ternary ---
  ['!true', false],
  ['!false', true],
  ['-5 + 3', -2],
  ['+"7"', 7],
  ['1 < 2 ? "y" : "n"', 'y'],
  ['1 > 2 ? "y" : "n"', 'n'],

  // --- Literals ---
  ['[1, 2, 3]', [1, 2, 3]],
  ['[]', []],
  ['{a: 1, b: 2}', { a: 1, b: 2 }],
  ['`Hi ${$json.name}`', 'Hi Alice'],
  ['`n=${1 + 1}`', 'n=2'],
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
  ['"quoted"', 'quoted'],
  ["'single'", 'single'],
  ['42', 42],
  ['3.14', 3.14],
  ['1e2', 100],

  // --- Member access / optional chaining / native methods ---
  ['$json?.nested?.x?.y', 5],
  ['$json.missing?.x', undefined],
  ['$json.missing?.x?.y', undefined],
  ['"abc".toUpperCase()', 'ABC'],
  ['"  abc  ".trim()', 'abc'],
  ['[3, 1, 2].sort()', [1, 2, 3]],
  ['"a,b,c".split(",")', ['a', 'b', 'c']],
  ['[1, 2, 3].includes(2)', true],
  ['"hello".slice(1, 3)', 'el'],
  ['"Hello".length', 5],
  ['[1, 2, 3].length', 3],
  ['$json.tags.join("-")', 'a-b-a'],
  ['$json.tags[0]', 'a'],
  ['$json.tags[-1]', undefined],

  // --- Composite / real-world style expressions ---
  ['$json.name + " is " + $json.age', 'Alice is 30'],
  ['$json.age >= 18 ? "adult" : "minor"', 'adult'],
  ['$json.tags.length > 0 ? $json.tags.first() : "none"', 'a'],
  ['($json.age + 1) * 2', 62],
  ['$json.age > $vars.threshold', true],
  ['$parameter.mode === "test"', true],
  ['$workflow.active && $execution.mode === "manual"', true],
  ['$json.score.round()', 3],
  ['$max($json.age, $vars.threshold)', 30],
  ['$min($json.age, $vars.threshold)', 5],
  ['$ifEmpty($jmespath($json, "missing.path"), "fallback")', 'fallback'],
  ['{a: $json.age, b: $json.name}', { a: 30, b: 'Alice' }],
  ['[$json.age, $json.name]', [30, 'Alice']],
  ['`${$json.name} is ${$json.age} years old`', 'Alice is 30 years old'],
  ['$json.email.extractEmail().toUpperCase()', 'ALICE@EXAMPLE.COM'],
  ['$node["Prev"].all().pluck("json")', [{ v: 10 }, { v: 20 }]],
  ['$items("Prev", 0).pluck("json")', [{ v: 10 }, { v: 20 }]],
  ['$input.all().pluck("json")', [{ n: 1 }, { n: 2 }, { n: 3 }]],
  ['$json.tags.unique().join(",")', 'a,b'],
];

describe('expression engine integration table', () => {
  it(`has at least 150 cases (has ${cases.length})`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(150);
  });

  it.each(cases)('%s => %j', (expr, expected) => {
    expect(evaluateExpressionSource(expr, ctx)).toEqual(expected);
  });
});

describe('expression engine integration — $now / $today (excluded from the equality table since they are wall-clock)', () => {
  it('$now resolves to a valid current Luxon DateTime', () => {
    const before = Date.now();
    const result = evaluateExpressionSource('$now', ctx) as DateTime;
    expect(DateTime.isDateTime(result)).toBe(true);
    expect(result.toMillis()).toBeGreaterThanOrEqual(before);
  });

  it('$today resolves to the start of the current day', () => {
    const result = evaluateExpressionSource('$today', ctx) as DateTime;
    expect(DateTime.isDateTime(result)).toBe(true);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
    expect(result.second).toBe(0);
  });
});
