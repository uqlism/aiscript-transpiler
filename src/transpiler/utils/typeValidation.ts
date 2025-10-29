import ts from "typescript";

/**
 * boolean型の式かどうかを検証する
 */
export function validateBooleanExpression(expr: ts.Expression, typeChecker: ts.TypeChecker): void {
    const type = typeChecker.getTypeAtLocation(expr);
    const typeString = typeChecker.typeToString(type);

    // boolean型以外の場合はエラー
    if (!(type.flags & ts.TypeFlags.Boolean) && !(type.flags & ts.TypeFlags.BooleanLiteral)) {
        // ただし、any型やunknown型は許可する（型情報が不完全な場合）
        if (!(type.flags & ts.TypeFlags.Any) && !(type.flags & ts.TypeFlags.Unknown)) {
            throw new Error(`if文の条件式はboolean型である必要があります。現在の型: ${typeString} at ${expr.getSourceFile()?.fileName}:${expr.getStart()}`);
        }
    }
}

/**
 * 配列型の式かどうかを検証する
 */
export function validateArrayExpression(expr: ts.Expression, typeChecker: ts.TypeChecker): void {
    const type = typeChecker.getTypeAtLocation(expr);
    const typeString = typeChecker.typeToString(type);

    // any型やunknown型は許可する（型情報が不完全な場合）
    if (type.flags & ts.TypeFlags.Any || type.flags & ts.TypeFlags.Unknown) {
        return;
    }

    // 配列リテラルは常に許可
    if (ts.isArrayLiteralExpression(expr)) {
        return;
    }

    // TypeScriptの組み込み配列型チェック
    if (typeChecker.isArrayType(type)) {
        return;
    }

    // タプル型チェック
    if (typeChecker.isTupleType && typeChecker.isTupleType(type)) {
        return;
    }

    // 複雑な型（Mapped Type、Conditional Typeなど）の場合は警告
    if (isComplexType(typeString)) {
        console.warn(`警告: for-of文の右辺の型が複雑で検証できません。実行時に配列であることを確認してください。型: ${typeString} at ${expr.getSourceFile()?.fileName}:${expr.getStart()}`);
        return;
    }

    // 配列型でない場合はエラー
    throw new Error(`for-of文の右辺は配列型である必要があります。現在の型: ${typeString} at ${expr.getSourceFile()?.fileName}:${expr.getStart()}`);
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
export function validateElementAccess(targetExpr: ts.Expression, indexExpr: ts.Expression, typeChecker: ts.TypeChecker): void {
    const targetType = typeChecker.getTypeAtLocation(targetExpr);
    const indexType = typeChecker.getTypeAtLocation(indexExpr);
    const targetTypeString = typeChecker.typeToString(targetType);
    const indexTypeString = typeChecker.typeToString(indexType);

    // any型やunknown型は許可する（型情報が不完全な場合）
    if (targetType.flags & ts.TypeFlags.Any || targetType.flags & ts.TypeFlags.Unknown ||
        indexType.flags & ts.TypeFlags.Any || indexType.flags & ts.TypeFlags.Unknown) {
        return;
    }

    // Union型の場合、すべてのメンバーが配列型かチェック
    if (targetType.flags & ts.TypeFlags.Union) {
        const unionType = targetType as ts.UnionType;
        const allArray = unionType.types.every(type =>
            typeChecker.isArrayType(type) ||
            (typeChecker.isTupleType && typeChecker.isTupleType(type))
        );
        if (allArray) {
            if (!(indexType.flags & ts.TypeFlags.Number) && !(indexType.flags & ts.TypeFlags.NumberLiteral)) {
                throw new Error(`配列のインデックスはnumber型である必要があります。現在のインデックス型: ${indexTypeString} at ${indexExpr.getSourceFile()?.fileName}:${indexExpr.getStart()}`);
            }
            return;
        }
    }

    // 配列型の場合、インデックスはnumber型である必要がある
    if (typeChecker.isArrayType(targetType) || (typeChecker.isTupleType && typeChecker.isTupleType(targetType))) {
        if (!(indexType.flags & ts.TypeFlags.Number) && !(indexType.flags & ts.TypeFlags.NumberLiteral)) {
            throw new Error(`配列のインデックスはnumber型である必要があります。現在のインデックス型: ${indexTypeString} at ${indexExpr.getSourceFile()?.fileName}:${indexExpr.getStart()}`);
        }
        return;
    }

    // オブジェクト型の場合、インデックスはstring型である必要がある
    if (targetType.flags & ts.TypeFlags.Object) {
        if (!(indexType.flags & ts.TypeFlags.String) && !(indexType.flags & ts.TypeFlags.StringLiteral)) {
            throw new Error(`オブジェクトのインデックスはstring型である必要があります。現在のインデックス型: ${indexTypeString} at ${indexExpr.getSourceFile()?.fileName}:${indexExpr.getStart()}`);
        }
        return;
    }

    // 複雑な型やType Guardによる型絞り込みの場合は警告
    if (isComplexType(targetTypeString) || isComplexType(indexTypeString) ||
        targetTypeString.includes('&') || targetTypeString.includes('|') ||
        isInControlFlowContext(targetExpr)) {
        console.warn(`警告: 要素アクセスの型が複雑で検証できません。実行時に適切な型であることを確認してください。ターゲット型: ${targetTypeString}, インデックス型: ${indexTypeString} at ${targetExpr.getSourceFile()?.fileName}:${targetExpr.getStart()}`);
        return;
    }

    // 配列でもオブジェクトでもない場合はエラー
    throw new Error(`要素アクセスは配列またはオブジェクトに対してのみ使用できます。現在の型: ${targetTypeString} at ${targetExpr.getSourceFile()?.fileName}:${targetExpr.getStart()}`);
}