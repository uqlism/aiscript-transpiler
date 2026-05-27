import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class BinaryExpressionPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    tryConvertExpressionAsStatements: (node: ts.Expression) => (Ast.Expression | Ast.Statement)[] | undefined;
    private unwrapParentheses;
    private convertDestructuringAssignment;
    private convertBinaryAssignExpression;
    private convertNullishCoalescing;
    private convertNullishAssignment;
    /**
     * a || b の変換。
     * - 両辺が boolean 型 → AiScript ネイティブ `or` ノード（短絡評価あり・高速）
     * - それ以外 → if-else ポリフィルで元の値を保持: `if (coerceToBool(a)) a else b`
     * - doTypeCheck = false → ネイティブ `or`（boolean 前提、型チェック不要なコード向け）
     */
    private convertLogicalOr;
    /**
     * a && b の変換。
     * - 両辺が boolean 型 → AiScript ネイティブ `and` ノード（短絡評価あり・高速）
     * - それ以外 → if-else ポリフィルで元の値を保持: `if (coerceToBool(a)) b else a`
     * - doTypeCheck = false → ネイティブ `and`（boolean 前提、型チェック不要なコード向け）
     */
    private convertLogicalAnd;
    /**
     * 文字列比較のポリフィル。AiScript の lt/gt は数値専用なので Str:lt を使う。
     * Str:lt(a, b) は a < b なら -1、等しければ 0、a > b なら 1 を返す。
     *
     *   a < b  → Str:lt(a, b) < 0
     *   a <= b → Str:lt(a, b) <= 0
     *   a > b  → Str:lt(a, b) > 0
     *   a >= b → Str:lt(a, b) >= 0
     */
    private buildStringCompare;
    private convertBinaryExpression;
}
//# sourceMappingURL=binaryExpression.d.ts.map