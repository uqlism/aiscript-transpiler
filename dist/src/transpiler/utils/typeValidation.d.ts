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
 * boolean型の式かどうかを検証し、違反時にエラーを投げる
 * @deprecated coerceToBool を使ってください
 */
export declare function validateBooleanLike(_expr: ts.Expression, _context: TranspilerContext, _errorMessage?: string): void;
/**
 * number型の式かどうかを検証し、違反時にエラーを投げる
 */
export declare function validateNumberLike(expr: ts.Expression, context: TranspilerContext, errorMessage?: string): void;
//# sourceMappingURL=typeValidation.d.ts.map