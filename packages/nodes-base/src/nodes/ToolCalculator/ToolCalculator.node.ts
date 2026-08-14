import type { INodeType, ISupplyDataFunctions } from '@n8n-clone/workflow';
import type { IAiTool } from '../shared/ai-types.js';

/**
 * A tiny recursive-descent parser for `+ - * / ( )` over decimal numbers — deliberately not
 * `eval`/`Function`, since this expression string ultimately comes from an LLM's tool-call
 * arguments (untrusted input).
 */
function evaluateArithmetic(expression: string): number {
  const input = expression.trim();
  let pos = 0;

  const peek = (): string => input[pos] ?? '';
  const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
  const skipSpaces = (): void => {
    while (peek() === ' ') pos++;
  };

  function parseNumber(): number {
    const start = pos;
    while (isDigit(peek()) || peek() === '.') pos++;
    const text = input.slice(start, pos);
    if (text === '') throw new Error(`Expected a number at position ${start}`);
    return Number(text);
  }

  function parseFactor(): number {
    skipSpaces();
    if (peek() === '(') {
      pos++;
      const value = parseExpression();
      skipSpaces();
      if (peek() !== ')') throw new Error('Expected a closing ")"');
      pos++;
      return value;
    }
    if (peek() === '-') {
      pos++;
      return -parseFactor();
    }
    return parseNumber();
  }

  function parseTerm(): number {
    let value = parseFactor();
    skipSpaces();
    while (peek() === '*' || peek() === '/') {
      const op = peek();
      pos++;
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
      skipSpaces();
    }
    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();
    skipSpaces();
    while (peek() === '+' || peek() === '-') {
      const op = peek();
      pos++;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
      skipSpaces();
    }
    return value;
  }

  const result = parseExpression();
  skipSpaces();
  if (pos !== input.length) throw new Error(`Unexpected character at position ${pos}`);
  return result;
}

export const toolCalculator: INodeType = {
  description: {
    displayName: 'Calculator Tool',
    name: 'toolCalculator',
    icon: 'fa:calculator',
    group: ['ai'],
    version: 1,
    description: 'Evaluates a basic arithmetic expression — a tool an AI Agent node can call',
    defaults: { name: 'Calculator' },
    inputs: [],
    outputs: ['ai_tool'],
    properties: [],
  },
  async supplyData(this: ISupplyDataFunctions): Promise<IAiTool> {
    return {
      name: 'calculator',
      description:
        'Evaluates a basic arithmetic expression using +, -, *, /, and parentheses. Input: {"expression": "12 * (3 + 4)"}.',
      schema: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'The arithmetic expression to evaluate' } },
        required: ['expression'],
      },
      invoke: async (args) => {
        const expression = String(args.expression ?? '');
        try {
          return String(evaluateArithmetic(expression));
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    };
  },
};
