import ts from "typescript";
import type { TranspilerContext } from "../base.js";
/**
 * boolean型の式かどうかを検証する
 */
export declare function validateBooleanExpression(expr: ts.Expression, context: TranspilerContext): void;
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
 */
export declare function validateBooleanLike(expr: ts.Expression, context: TranspilerContext, errorMessage?: string): void;
/**
 * number型の式かどうかを検証し、違反時にエラーを投げる
 */
export declare function validateNumberLike(expr: ts.Expression, context: TranspilerContext, errorMessage?: string): void;
//# sourceMappingURL=typeValidation.d.ts.map