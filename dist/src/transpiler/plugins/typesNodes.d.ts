import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
/** TSの型にしか影響しない表現を無視 */
export declare class TypeNodesPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertAsExpression;
    private convertSatisfiesExpression;
}
//# sourceMappingURL=typesNodes.d.ts.map