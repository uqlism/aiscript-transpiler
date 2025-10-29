import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import type { TranspilerContext } from "../base.js";
/**
 * 分割代入を展開してAiScript のdef|assign文の配列に変換する
 */
export declare function convertObjectAssignment(node: ts.ObjectLiteralExpression, sourceExpr: Ast.Expression, helper: TranspilerContext): Ast.Assign[];
/**
 * 分割代入を展開してAiScript のdef|assign文の配列に変換する
 */
export declare function convertArrayAssignment(node: ts.ArrayLiteralExpression, sourceExpr: Ast.Expression, helper: TranspilerContext): Ast.Assign[];
/**
 * 分割代入を展開してAiScript のdef|assign文の配列に変換する
 */
export declare function convertDestructuringAssignment(nameNode: ts.BindingPattern, sourceExpr: Ast.Expression, isMutable: boolean, helper: TranspilerContext): Ast.Definition[];
/**
 * 関数の引数やfor-ofのitemなどのBindingNameを処理し、必要に応じて一時変数を介して展開する
 */
export declare function convertBindingNameArg(bindingName: ts.BindingName, isMutable: boolean, context: TranspilerContext): [Ast.Identifier, Ast.Definition[]];
//# sourceMappingURL=destructuring.d.ts.map