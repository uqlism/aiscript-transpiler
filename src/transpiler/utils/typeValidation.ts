import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import type { TranspilerContext } from "../base.js";
import { dummyLoc } from "../consts.js";

/**
 * TypeScript の truthy 変換ルールに従い、AiScript 式を boolean 式に変換する。
 * - boolean 型 → そのまま返す
 * - number 型 → `x != 0`
 * - string 型 → `x != ""`
 * - その他 / nullable → `x != null`
 *
 * doTypeCheck が false の場合は型情報なしのためそのまま返す。
 */
export function coerceToBool(
	tsExpr: ts.Expression,
	aisExpr: Ast.Expression,
	context: TranspilerContext,
): Ast.Expression {
	if (!context.doTypeCheck) return aisExpr;

	const { typeChecker } = context;
	if (isBooleanLike(tsExpr, typeChecker)) return aisExpr;

	const type = typeChecker.getTypeAtLocation(tsExpr);

	// null/undefined を含まない純粋な number → != 0
	if (isNumberLike(tsExpr, typeChecker) && !hasNullableComponent(type)) {
		return {
			type: "neq",
			left: aisExpr,
			right: { type: "num", value: 0, loc: dummyLoc },
			loc: dummyLoc,
		};
	}

	// null/undefined を含まない純粋な string → != ""
	if (isStringLike(tsExpr, typeChecker) && !hasNullableComponent(type)) {
		return {
			type: "neq",
			left: aisExpr,
			right: { type: "str", value: "", loc: dummyLoc },
			loc: dummyLoc,
		};
	}

	// それ以外（nullable / object / unknown / any 等）→ != null
	return {
		type: "neq",
		left: aisExpr,
		right: { type: "null", loc: dummyLoc },
		loc: dummyLoc,
	};
}

/** 型が null または undefined を含むかどうか */
function hasNullableComponent(type: ts.Type): boolean {
	if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) return true;
	if (type.isUnion()) {
		return type.types.some(
			(t) => !!(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
		);
	}
	return false;
}

/**
 * boolean型の式かどうかを検証する
 * @deprecated coerceToBool を使ってください
 */
export function validateBooleanExpression(
	_expr: ts.Expression,
	_context: TranspilerContext,
): void {
	// coerceToBool に移行済み。エラーは吐かない。
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
	// ただし、数値インデックスシグネチャを持つ型（RegExpMatchResult など）は
	// number インデックスも許可する（変換は property-access プラグインが担当）
	if (targetType.flags & ts.TypeFlags.Object) {
		if (isNumberLike(indexExpr, context.typeChecker)) {
			const numIndexType = context.typeChecker.getIndexTypeOfType(
				targetType,
				ts.IndexKind.Number,
			);
			if (numIndexType) return; // 数値インデックスシグネチャあり → OK
		}
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
export function isNumberLike(
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
 * @deprecated coerceToBool を使ってください
 */
export function validateBooleanLike(
	_expr: ts.Expression,
	_context: TranspilerContext,
	_errorMessage?: string,
): void {
	// coerceToBool に移行済み。エラーは吐かない。
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
 * string型に代入可能な式かどうかを判定する。
 * any/unknown 型は除外（型情報不足とみなし string 扱いしない）。
 */
export function isStringLike(
	expr: ts.Expression,
	typeChecker: ts.TypeChecker,
): boolean {
	const type = typeChecker.getTypeAtLocation(expr);
	// any/unknown は string 扱いしない
	if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
	return typeChecker.isTypeAssignableTo(type, typeChecker.getStringType());
}

/**
 * ts.Type に文字列成分（string / string リテラル / テンプレートリテラル型 / union の一部）が
 * 含まれるかどうかを判定する。
 * any/unknown は含まれない扱いにして過剰な string 判定を防ぐ。
 *
 * 用途: `+` 演算子のオペランド型が `string | number` のように union を含む場合でも
 *       文字列連結パスを選択できるようにする。
 */
export function hasStringComponent(type: ts.Type): boolean {
	if (
		type.flags &
		(ts.TypeFlags.String |
			ts.TypeFlags.StringLiteral |
			ts.TypeFlags.TemplateLiteral |
			ts.TypeFlags.StringMapping)
	) {
		return true;
	}
	if (type.isUnion()) {
		return type.types.some((t) => hasStringComponent(t));
	}
	return false;
}

/**
 * ts.Type が boolean-like（any/unknown を除く）かどうか判定する。
 * `&&` / `||` のネイティブ AiScript `and`/`or` ノードを使うかどうかの判断に使う。
 */
export function isBooleanLikeType(
	type: ts.Type,
	typeChecker: ts.TypeChecker,
): boolean {
	// any/unknown は型情報不足とみなし boolean とは扱わない
	if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
	return typeChecker.isTypeAssignableTo(type, typeChecker.getBooleanType());
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
