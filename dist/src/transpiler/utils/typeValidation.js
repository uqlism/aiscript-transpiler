import ts from "typescript";
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
export function coerceToBool(tsExpr, aisExpr, context) {
    if (!context.doTypeCheck)
        return aisExpr;
    const { typeChecker } = context;
    if (isBooleanLike(tsExpr, typeChecker))
        return aisExpr;
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
function hasNullableComponent(type) {
    if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
        return true;
    if (type.isUnion()) {
        return type.types.some((t) => !!(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
    }
    return false;
}
/**
 * boolean型の式かどうかを検証する
 * @deprecated coerceToBool を使ってください
 */
export function validateBooleanExpression(_expr, _context) {
    // coerceToBool に移行済み。エラーは吐かない。
}
/**
 * 配列型の式かどうかを検証する
 */
export function validateArrayExpression(expr, context) {
    if (!context.doTypeCheck) {
        return;
    }
    const type = context.typeChecker.getTypeAtLocation(expr);
    const typeString = context.typeChecker.typeToString(type);
    // TypeScriptの組み込み配列型チェック
    if (!isArrayLike(expr, context.typeChecker)) {
        // 配列型でない場合はエラー
        context.throwError(`配列型である必要があります。現在の型: ${typeString}`, expr);
    }
}
/**
 * 要素アクセス式の型を検証する
 * Array[number] と Object[string] のみ許可
 */
export function validateElementAccess(targetExpr, indexExpr, context) {
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
            context.throwError(`配列のインデックスはnumber型である必要があります。現在のインデックス型: ${targetTypeString}[${indexTypeString}]`, indexExpr);
        }
        return;
    }
    // オブジェクト型の場合、インデックスはstring型である必要がある
    if (targetType.flags & ts.TypeFlags.Object) {
        if (!isStringLike(indexExpr, context.typeChecker)) {
            context.throwError(`オブジェクトのインデックスはstring型である必要があります。現在のインデックス型: ${targetTypeString}[${indexTypeString}]`, indexExpr);
        }
        return;
    }
    // 配列でもオブジェクトでもない場合はエラー
    context.throwError(`要素アクセスは配列またはオブジェクトに対してのみ使用できます。現在の型: (${targetTypeString})[${indexTypeString}]`, targetExpr);
}
/**
 * boolean型に代入可能な式かどうかを判定する
 */
function isBooleanLike(expr, typeChecker) {
    return typeChecker.isTypeAssignableTo(typeChecker.getTypeAtLocation(expr), typeChecker.getBooleanType());
}
/**
 * number型に代入可能な式かどうかを判定する
 */
function isNumberLike(expr, typeChecker) {
    return typeChecker.isTypeAssignableTo(typeChecker.getTypeAtLocation(expr), typeChecker.getNumberType());
}
/**
 * boolean型の式かどうかを検証し、違反時にエラーを投げる
 * @deprecated coerceToBool を使ってください
 */
export function validateBooleanLike(_expr, _context, _errorMessage) {
    // coerceToBool に移行済み。エラーは吐かない。
}
/**
 * number型の式かどうかを検証し、違反時にエラーを投げる
 */
export function validateNumberLike(expr, context, errorMessage) {
    if (!context.doTypeCheck) {
        return;
    }
    if (!isNumberLike(expr, context.typeChecker)) {
        const type = context.typeChecker.getTypeAtLocation(expr);
        const typeString = context.typeChecker.typeToString(type);
        context.throwError(errorMessage || `number型である必要があります。現在の型: ${typeString}`, expr);
    }
}
/**
 * string型に代入可能な式かどうかを判定する
 */
function isStringLike(expr, typeChecker) {
    return typeChecker.isTypeAssignableTo(typeChecker.getTypeAtLocation(expr), typeChecker.getStringType());
}
/**
 * 配列型の式かどうかを判定する
 */
function isArrayLike(expr, typeChecker) {
    return typeChecker.isArrayLikeType(typeChecker.getTypeAtLocation(expr));
}
//# sourceMappingURL=typeValidation.js.map