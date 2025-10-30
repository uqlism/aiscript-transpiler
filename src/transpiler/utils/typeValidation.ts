import ts from "typescript";

/**
 * boolean型の式かどうかを検証する
 */
export function validateBooleanExpression(
	expr: ts.Expression,
	typeChecker: ts.TypeChecker,
): void {
	if (!isBooleanLike(expr, typeChecker)) {
		const type = typeChecker.getTypeAtLocation(expr);
		const typeString = typeChecker.typeToString(type);
		throw new Error(
			`boolean型である必要があります。現在の型: ${typeString} at ${expr.getSourceFile()?.fileName}:${expr.getStart()}`,
		);
	}
}

/**
 * 配列型の式かどうかを検証する
 */
export function validateArrayExpression(
	expr: ts.Expression,
	typeChecker: ts.TypeChecker,
): void {
	const type = typeChecker.getTypeAtLocation(expr);
	const typeString = typeChecker.typeToString(type);

	// TypeScriptの組み込み配列型チェック
	if (!isArrayLike(expr, typeChecker)) {
		// 配列型でない場合はエラー
		throw new Error(
			`配列型である必要があります。現在の型: ${typeString} at ${expr.getSourceFile()?.fileName}:${expr.getStart()}`,
		);
	}
}

/**
 * 複雑な型（Mapped Type、Conditional Type等）かどうかを判定
 */
function isComplexType(typeString: string): boolean {
	// Mapped Type, Conditional Type, Index Access Type等のパターン
	return /\[.*in.*\]|<.*>.*\?.*:|\[.*keyof.*\]|infer\s+\w+/.test(typeString);
}

/**
 * Type Guardや制御フロー分析の文脈かどうかを判定
 */
function isInControlFlowContext(expr: ts.Expression): boolean {
	let parent = expr.parent;

	// if文の中にいるかチェック
	while (parent) {
		if (ts.isIfStatement(parent)) {
			return true;
		}
		if (ts.isConditionalExpression(parent)) {
			return true;
		}
		parent = parent.parent;
	}

	return false;
}

/**
 * 要素アクセス式の型を検証する
 * Array[number] と Object[string] のみ許可
 */
export function validateElementAccess(
	targetExpr: ts.Expression,
	indexExpr: ts.Expression,
	typeChecker: ts.TypeChecker,
): void {
	const targetType = typeChecker.getTypeAtLocation(targetExpr);
	const indexType = typeChecker.getTypeAtLocation(indexExpr);
	const targetTypeString = typeChecker.typeToString(targetType);
	const indexTypeString = typeChecker.typeToString(indexType);

	// 配列型の場合、インデックスはnumber型である必要がある
	if (isArrayLike(targetExpr, typeChecker)) {
		if (!isNumberLike(indexExpr, typeChecker)) {
			throw new Error(
				`配列のインデックスはnumber型である必要があります。現在のインデックス型: ${targetTypeString}[${indexTypeString}] at ${indexExpr.getSourceFile()?.fileName}:${indexExpr.getStart()}`,
			);
		}
		return;
	}

	// オブジェクト型の場合、インデックスはstring型である必要がある
	if (targetType.flags & ts.TypeFlags.Object) {
		if (!isStringLike(indexExpr, typeChecker)) {
			throw new Error(
				`オブジェクトのインデックスはstring型である必要があります。現在のインデックス型: ${targetTypeString}[${indexTypeString}] at ${indexExpr.getSourceFile()?.fileName}:${indexExpr.getStart()}`,
			);
		}
		return;
	}

	// 配列でもオブジェクトでもない場合はエラー
	throw new Error(
		`要素アクセスは配列またはオブジェクトに対してのみ使用できます。現在の型: (${targetTypeString})[${indexTypeString}] at ${targetExpr.getSourceFile()?.fileName}:${targetExpr.getStart()}`,
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
