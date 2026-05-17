import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
export class ExportStatementPlugin extends TranspilerPlugin {
    tryConvertStatementAsStatements = (node) => {
        if (ts.isExportDeclaration(node)) {
            return this.convertExportDeclaration(node);
        }
        if (ts.isExportAssignment(node)) {
            return this.convertExportAssignment(node);
        }
    };
    convertExportDeclaration(node) {
        if (node.moduleSpecifier) {
            this.converter.throwError("Re-exports are not supported yet", node);
        }
        if (!node.exportClause) {
            this.converter.throwError("Export all (*) is not supported", node);
        }
        if (ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
                const exportedName = element.propertyName?.text || element.name.text;
                this.converter.addExport(exportedName);
            }
        }
        return [];
    }
    // export default expr  →  let __default = expr; addExport("__default")
    convertExportAssignment(node) {
        if (node.isExportEquals) {
            // module.exports = ... (非サポート)
            this.converter.throwError("export = は非サポートです。export default を使ってください", node);
        }
        const expr = this.converter.convertExpressionAsExpression(node.expression);
        this.converter.addExport("__default");
        // 式が識別子の場合は __default へのエイリアス定義を追加
        const def = {
            type: "def",
            dest: { type: "identifier", name: "__default", loc: dummyLoc },
            expr,
            mut: false,
            attr: [],
            loc: dummyLoc,
        };
        return [def];
    }
}
//# sourceMappingURL=exportStatement.js.map