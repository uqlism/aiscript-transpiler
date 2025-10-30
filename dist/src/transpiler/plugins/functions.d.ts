import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
export declare class FunctionsPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertFunctionDeclaration;
    private convertInlineFunction;
    private processParameters;
    private hasExportModifier;
    private hasDeclareModifier;
}
//# sourceMappingURL=functions.d.ts.map