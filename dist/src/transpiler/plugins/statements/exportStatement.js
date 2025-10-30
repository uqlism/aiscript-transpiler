import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
export class ExportStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isExportDeclaration(node)) {
            return this.convertExportDeclaration(node);
        }
    };
    convertExportDeclaration(node) {
        if (node.moduleSpecifier) {
            // Re-export: export { foo } from "./module"
            this.converter.throwError("Re-exports are not supported yet", node);
        }
        if (!node.exportClause) {
            // export * from "./module"
            this.converter.throwError("Export all (*) is not supported", node);
        }
        if (ts.isNamedExports(node.exportClause)) {
            // export { foo, bar }
            for (const element of node.exportClause.elements) {
                const exportedName = element.propertyName?.text || element.name.text;
                this.converter.addExport(exportedName);
            }
        }
        // export文自体は何も生成しない（最後にeval blockで出力される）
        return [];
    }
}
//# sourceMappingURL=exportStatement.js.map