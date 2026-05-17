import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class LiteralPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertNumericLiteral;
    private convertTemplateExpression;
    private convertNoSubstitutionTemplateLiteral;
    private convertArrayLiteralExpression;
    private buildArrWithSpread;
    private convertObjectLiteralExpression;
    /**
     * スプレッドや算出キーを含むオブジェクトを eval ブロックで生成する。
     * 左から順に処理し:
     *   - 静的キー → 蓄積して Obj:merge でまとめてフラッシュ
     *   - 算出キー → tmp[expr] = val でフラッシュ後インデックス代入
     *   - スプレッド → Obj:merge(tmp, spread) でフラッシュ後マージ
     */
    private buildDynamicObj;
    private buildPlainObj;
    private buildObjWithSpread;
    private convertMethodToInlineFunction;
}
//# sourceMappingURL=literals.d.ts.map