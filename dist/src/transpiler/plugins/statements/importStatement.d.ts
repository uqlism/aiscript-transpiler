import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export declare class ImportStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined;
    private convertImportDeclaration;
}
//# sourceMappingURL=importStatement.d.ts.map