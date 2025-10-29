import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class UnaryExpressionPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    tryConvertExpressionAsStatements: (node: ts.Expression) => (Ast.Expression | Ast.Statement)[] | undefined;
    private convertPrefixUnaryExpressionAsExpression;
    private convertPrefixUnaryExpressionAsStatement;
    private convertPostfixUnaryExpression;
    private convertPostfixUnaryExpressionAsStatement;
}
//# sourceMappingURL=unaryExpression.d.ts.map