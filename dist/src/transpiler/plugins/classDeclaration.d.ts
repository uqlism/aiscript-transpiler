import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
export declare class ClassDeclarationPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    tryConvertExpressionAsExpression: (node: ts.Expression) => Ast.Expression | undefined;
    private convertClassDeclaration;
    private getBaseClassName;
    private createNewMethod;
    private getSuperCallArgs;
    private convertMethodToFunction;
    private convertNewExpression;
}
//# sourceMappingURL=classDeclaration.d.ts.map