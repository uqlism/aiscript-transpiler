import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import type { TranspilerContext } from "../base.js";
/**
 * BindingPatternをAiScript用の分割代入パターンに変換する
 */
export declare function convertBindingPattern(bindingName: ts.BindingName): Ast.Expression;
/**
 * 代入文用の分割代入パターンに変換する（ObjectLiteralExpression/ArrayLiteralExpression用）
 */
export declare function convertDestructuringPattern(node: ts.Expression): Ast.Expression;
/**
 * 関数の引数やfor-ofのitemなどのBindingNameを処理し、必要に応じて一時変数を介して展開する
 */
export declare function convertBindingNameArg(bindingName: ts.BindingName, isMutable: boolean, context: TranspilerContext): [Ast.Identifier, Ast.Definition[]];
type FnParam = Ast.Fn["params"][number];
/**
 * 関数/メソッド/コンストラクタのパラメータをAiScript用に変換する
 */
export declare function processParameters(parameters: readonly ts.ParameterDeclaration[], context: TranspilerContext): FnParam[];
export {};
//# sourceMappingURL=destructuring.d.ts.map