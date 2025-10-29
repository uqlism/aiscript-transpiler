import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class ExpressionsPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertIdentifier;
    private convertCallExpression;
    private convertParenthesizedExpression;
    private convertConditionalExpression;
}
//# sourceMappingURL=expressions.d.ts.map