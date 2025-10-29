import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class SwitchStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    private convertSwitchStatement;
    private createNull;
    private convertSwitchCaseBodyToStatements;
}
//# sourceMappingURL=switchStatement.d.ts.map