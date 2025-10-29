import ts from "typescript";
/**
 * boolean型の式かどうかを検証する
 */
export declare function validateBooleanExpression(expr: ts.Expression, typeChecker: ts.TypeChecker): void;
/**
 * 配列型の式かどうかを検証する
 */
export declare function validateArrayExpression(expr: ts.Expression, typeChecker: ts.TypeChecker): void;
/**
 * 要素アクセス式の型を検証する
 * Array[number] と Object[string] のみ許可
 */
export declare function validateElementAccess(targetExpr: ts.Expression, indexExpr: ts.Expression, typeChecker: ts.TypeChecker): void;
//# sourceMappingURL=typeValidation.d.ts.map