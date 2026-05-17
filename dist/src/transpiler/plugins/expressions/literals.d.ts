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
     * 算出キー { [expr]: val } を含むオブジェクトを eval ブロックで生成する。
     * eval { var __obj = ({}); __obj[key] = val; ...; __obj }
     */
    private buildObjWithComputed;
    private buildPlainObj;
    private buildObjWithSpread;
    private convertMethodToInlineFunction;
}
//# sourceMappingURL=literals.d.ts.map