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
        // export type { Foo } / export type * from ... → 型のみ、ランタイム不要
        if (node.isTypeOnly)
            return [];
        if (node.moduleSpecifier) {
            // Re-export 系
            if (!ts.isStringLiteral(node.moduleSpecifier)) {
                this.converter.throwError("モジュール指定子は文字列リテラルである必要があります", node.moduleSpecifier);
            }
            const importPath = node.moduleSpecifier.text;
            if (!node.exportClause) {
                // export * from './other'
                const moduleRef = this.converter.getModuleRef(importPath, node);
                this.converter.addReExportAll(moduleRef);
                return [];
            }
            if (ts.isNamedExports(node.exportClause)) {
                // export { foo, bar as baz } from './other'
                const moduleRef = this.converter.getModuleRef(importPath, node);
                const statements = [];
                for (const element of node.exportClause.elements) {
                    if (element.isTypeOnly)
                        continue; // export { type Foo } → skip
                    const sourceName = element.propertyName?.text || element.name.text;
                    const localName = element.name.text;
                    // let localName = __modules["other"].sourceName
                    statements.push({
                        type: "def",
                        dest: { type: "identifier", name: localName, loc: dummyLoc },
                        expr: {
                            type: "prop",
                            target: moduleRef,
                            name: sourceName,
                            loc: dummyLoc,
                        },
                        mut: false,
                        attr: [],
                        loc: dummyLoc,
                    });
                    this.converter.addExport(localName);
                }
                return statements;
            }
            return [];
        }
        if (!node.exportClause) {
            // export * (ソースなし) → 意味がないのでスキップ
            return [];
        }
        if (ts.isNamedExports(node.exportClause)) {
            // export { foo, bar }
            for (const element of node.exportClause.elements) {
                if (element.isTypeOnly)
                    continue;
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