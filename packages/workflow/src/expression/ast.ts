/** AST for the expression sub-language evaluated inside `{{ ... }}`. Expressions only — no statements, no loops, no user-defined functions. */

export type Expr =
  | { kind: 'Literal'; value: string | number | boolean | null | undefined }
  | { kind: 'TemplateLiteral'; quasis: string[]; expressions: Expr[] }
  | { kind: 'Identifier'; name: string }
  | { kind: 'ArrayLiteral'; elements: Expr[] }
  | { kind: 'ObjectLiteral'; properties: ObjectProperty[] }
  | { kind: 'Member'; object: Expr; property: Expr; computed: boolean; optional: boolean }
  | { kind: 'Call'; callee: Expr; args: Expr[]; optional: boolean }
  | { kind: 'Unary'; operator: '!' | '-' | '+'; argument: Expr }
  | { kind: 'Binary'; operator: string; left: Expr; right: Expr }
  | { kind: 'Logical'; operator: '&&' | '||' | '??'; left: Expr; right: Expr }
  | { kind: 'Conditional'; test: Expr; consequent: Expr; alternate: Expr };

export interface ObjectProperty {
  key: string;
  computed: boolean;
  keyExpr?: Expr;
  value: Expr;
}
