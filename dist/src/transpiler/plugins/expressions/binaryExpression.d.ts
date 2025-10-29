import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class BinaryExpressionPlugin extends TranspilerPlugin {
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    tryConvertExpressionAsStatements: (node: ts.Expression) => Ast.Statement[] | undefined;
    private unwrapParentheses;
    private convertDestructuringAssignment;
    private convertBinaryAssignExpression;
    private convertBinaryExpression;
}
//# sourceMappingURL=binaryExpression.d.ts.map