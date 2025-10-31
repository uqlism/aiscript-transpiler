import ts from "typescript";
import type { TranspilerContext } from "../base.js";

/**
 * boolean型の式かどうかを検証する
 */
export function validateBooleanExpression(
	expr: ts.Expression,
	context: TranspilerContext,
): void {
	if (!context.doTypeCheck) {
		return;
	}

	if (!isBooleanLike(expr, context.typeChecker)) {
		const type = context.typeChecker.getTypeAtLocation(expr);
		const typeString = context.typeChecker.typeToString(type);
		context.throwError(
			`boolean型である必要があります。現在の型: ${typeString}`,
			expr,
		);
	}
}

/**
 * 配列型の式かどうかを検証する
 */
export function validateArrayExpression(
	expr: ts.Expression,
	context: TranspilerContext,
): void {
	if (!context.doTypeCheck) {
		return;
	}

	const type = context.typeChecker.getTypeAtLocation(expr);
	const typeString = context.typeChecker.typeToString(type);

	// TypeScriptの組み込み配列型チェック
	if (!isArrayLike(expr, context.typeChecker)) {
		// 配列型でない場合はエラー
		context.throwError(
			`配列型である必要があります。現在の型: ${typeString}`,
			expr,
		);
	}
}

/**
 * 要素アクセス式の型を検証する
 * Array[number] と Object[string] のみ許可
 */
export function validateElementAccess(
	targetExpr: ts.Expression,
	indexExpr: ts.Expression,
	context: TranspilerContext,
): void {
	if (!context.doTypeCheck) {
		return;
	}

	const targetType = context.typeChecker.getTypeAtLocation(targetExpr);
	const indexType = context.typeChecker.getTypeAtLocation(indexExpr);
	const targetTypeString = context.typeChecker.typeToString(targetType);
	const indexTypeString = context.typeChecker.typeToString(indexType);

	// 配列型の場合、インデックスはnumber型である必要がある
	if (isArrayLike(targetExpr, context.typeChecker)) {
		if (!isNumberLike(indexExpr, context.typeChecker)) {
			context.throwError(
				`配列のインデックスはnumber型である必要があります。現在のインデックス型: ${targetTypeString}[${indexTypeString}]`,
				indexExpr,
			);
		}
		return;
	}

	// オブジェクト型の場合、インデックスはstring型である必要がある
	if (targetType.flags & ts.TypeFlags.Object) {
		if (!isStringLike(indexExpr, context.typeChecker)) {
			context.throwError(
				`オブジェクトのインデックスはstring型である必要があります。現在のインデックス型: ${targetTypeString}[${indexTypeString}]`,
				indexExpr,
			);
		}
		return;
	}

	// 配列でもオブジェクトでもない場合はエラー
	context.throwError(
		`要素アクセスは配列またはオブジェクトに対してのみ使用できます。現在の型: (${targetTypeString})[${indexTypeString}]`,
		targetExpr,
	);
}

/**
 * boolean型に代入可能な式かどうかを判定する
 */
function isBooleanLike(
	expr: ts.Expression,
	typeChecker: ts.TypeChecker,
): boolean {
	return typeChecker.isTypeAssignableTo(
		typeChecker.getTypeAtLocation(expr),
		typeChecker.getBooleanType(),
	);
}

/**
 * number型に代入可能な式かどうかを判定する
 */
function isNumberLike(
	expr: ts.Expression,
	typeChecker: ts.TypeChecker,
): boolean {
	return typeChecker.isTypeAssignableTo(
		typeChecker.getTypeAtLocation(expr),
		typeChecker.getNumberType(),
	);
}

/**
 * boolean型の式かどうかを検証し、違反時にエラーを投げる
 */
export function validateBooleanLike(
	expr: ts.Expression,
	context: TranspilerContext,
	errorMessage?: string,
): void {
	if (!context.doTypeCheck) {
		return;
	}

	if (!isBooleanLike(expr, context.typeChecker)) {
		const type = context.typeChecker.getTypeAtLocation(expr);
		const typeString = context.typeChecker.typeToString(type);
		context.throwError(
			errorMessage || `boolean型である必要があります。現在の型: ${typeString}`,
			expr,
		);
	}
}

/**
 * number型の式かどうかを検証し、違反時にエラーを投げる
 */
export function validateNumberLike(
	expr: ts.Expression,
	context: TranspilerContext,
	errorMessage?: string,
): void {
	if (!context.doTypeCheck) {
		return;
	}

	if (!isNumberLike(expr, context.typeChecker)) {
		const type = context.typeChecker.getTypeAtLocation(expr);
		const typeString = context.typeChecker.typeToString(type);
		context.throwError(
			errorMessage || `number型である必要があります。現在の型: ${typeString}`,
			expr,
		);
	}
}

/**
 * string型に代入可能な式かどうかを判定する
 */
function isStringLike(
	expr: ts.Expression,
	typeChecker: ts.TypeChecker,
): boolean {
	return typeChecker.isTypeAssignableTo(
		typeChecker.getTypeAtLocation(expr),
		typeChecker.getStringType(),
	);
}

/**
 * 配列型の式かどうかを判定する
 */
function isArrayLike(
	expr: ts.Expression,
	typeChecker: ts.TypeChecker,
): boolean {
	return typeChecker.isArrayLikeType(typeChecker.getTypeAtLocation(expr));
}
