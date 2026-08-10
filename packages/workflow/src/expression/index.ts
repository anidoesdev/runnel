export { parseExpressionSource } from './parser.js';
export { evaluateAst, stringifyForTemplate } from './evaluator.js';
export type { EvaluateOptions } from './evaluator.js';
export {
  isExpression,
  evaluateExpressionSource,
  evaluateExpressionString,
} from './template.js';
export type { EvaluateExpressionOptions } from './template.js';
export { EXPRESSION_SCOPE_DEFINITIONS, getScopeDefinition, createScopeResolver } from './scope.js';
export { jmespathLite } from './jmespath-lite.js';
export type { Expr, ObjectProperty } from './ast.js';
