import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import type { TranspilerContext } from "../base.js";
/**
 * TypeScript の truthy 変換ルールに従い、AiScript 式を boolean 式に変換する。
 * - boolean 型 → そのまま返す
 * - number 型 → `x != 0`
 * - string 型 → `x != ""`
 * - その他 / nullable → `x != null`
 *
 * doTypeCheck が false の場合は型情報なしのためそのまま返す。
 */
export declare function coerceToBool(tsExpr: ts.Expression, aisExpr: Ast.Expression, context: TranspilerContext): Ast.Expression;
/**
 * boolean型の式かどうかを検証する
 * @deprecated coerceToBool を使ってください
 */
export declare function validateBooleanExpression(_expr: ts.Expression, _context: TranspilerContext): void;
/**
 * 配列型の式かどうかを検証する
 */
export declare function validateArrayExpression(expr: ts.Expression, context: TranspilerContext): void;
/**
 * 要素アクセス式の型を検証する
 * Array[number] と Object[string] のみ許可
 */
export declare function validateElementAccess(targetExpr: ts.Expression, indexExpr: ts.Expression, context: TranspilerContext): void;
/**
 * number型に代入可能な式かどうかを判定する
 */
export declare function isNumberLike(expr: ts.Expression, typeChecker: ts.TypeChecker): boolean;
/**
 * boolean型の式かどうかを検証し、違反時にエラーを投げる
 * @deprecated coerceToBool を使ってください
 */
export declare function validateBooleanLike(_expr: ts.Expression, _context: TranspilerContext, _errorMessage?: string): void;
/**
 * number型の式かどうかを検証し、違反時にエラーを投げる
 */
export declare function validateNumberLike(expr: ts.Expression, context: TranspilerContext, errorMessage?: string): void;
/**
 * string型に代入可能な式かどうかを判定する。
 * any/unknown 型は除外（型情報不足とみなし string 扱いしない）。
 */
export declare function isStringLike(expr: ts.Expression, typeChecker: ts.TypeChecker): boolean;
/**
 * ts.Type に文字列成分（string / string リテラル / テンプレートリテラル型 / union の一部）が
 * 含まれるかどうかを判定する。
 * any/unknown は含まれない扱いにして過剰な string 判定を防ぐ。
 *
 * 用途: `+` 演算子のオペランド型が `string | number` のように union を含む場合でも
 *       文字列連結パスを選択できるようにする。
 */
export declare function hasStringComponent(type: ts.Type): boolean;
/**
 * ts.Type が boolean-like（any/unknown を除く）かどうか判定する。
 * `&&` / `||` のネイティブ AiScript `and`/`or` ノードを使うかどうかの判断に使う。
 */
export declare function isBooleanLikeType(type: ts.Type, typeChecker: ts.TypeChecker): boolean;
//# sourceMappingURL=typeValidation.d.ts.map