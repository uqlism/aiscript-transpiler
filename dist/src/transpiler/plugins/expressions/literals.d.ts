import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class LiteralPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertNumericLiteral;
    private convertTemplateExpression;
    private convertNoSubstitutionTemplateLiteral;
    private convertArrayLiteralExpression;
    private convertObjectLiteralExpression;
    private convertMethodToInlineFunction;
}
//# sourceMappingURL=literals.d.ts.map