import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";

export class ImportStatementPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		if (ts.isImportDeclaration(node)) {
			return this.convertImportDeclaration(node);
		}
	};

	private convertImportDeclaration(
		node: ts.ImportDeclaration,
	): (Ast.Expression | Ast.Statement)[] {
		// import�K�importPath�֗
		if (!ts.isStringLiteral(node.moduleSpecifier)) {
			this.converter.throwError(
				"Import specifier must be a string literal",
				node.moduleSpecifier,
			);
		}

		const importPath = node.moduleSpecifier.text;
		const moduleRef = this.converter.getModuleRef(importPath);

		if (!node.importClause) {
			// import "./module" n�Fjo\(nnimport
			// U�WjD
			return [];
		}

		const statements: (Ast.Expression | Ast.Statement)[] = [];

		// Named imports: import { foo, bar } from "./module"
		if (
			node.importClause.namedBindings &&
			ts.isNamedImports(node.importClause.namedBindings)
		) {
			for (const element of node.importClause.namedBindings.elements) {
				const importedName = element.propertyName?.text || element.name.text;
				const localName = element.name.text;

				this.converter.validateVariableName(localName, element.name);

				// const localName = moduleRef.importedName
				statements.push({
					type: "def",
					dest: { type: "identifier", name: localName, loc: dummyLoc },
					expr: {
						type: "prop",
						target: moduleRef,
						name: importedName,
						loc: dummyLoc,
					},
					mut: false,
					attr: [],
					loc: dummyLoc,
				});
			}
		}

		// Default import: import foo from "./module"
		if (node.importClause.name) {
			const localName = node.importClause.name.text;
			this.converter.validateVariableName(localName, node.importClause.name);

			// const localName = moduleRef.default
			statements.push({
				type: "def",
				dest: { type: "identifier", name: localName, loc: dummyLoc },
				expr: {
					type: "prop",
					target: moduleRef,
					name: "default",
					loc: dummyLoc,
				},
				mut: false,
				attr: [],
				loc: dummyLoc,
			});
		}

		// Namespace import: import * as foo from "./module"
		if (
			node.importClause.namedBindings &&
			ts.isNamespaceImport(node.importClause.namedBindings)
		) {
			const localName = node.importClause.namedBindings.name.text;
			this.converter.validateVariableName(
				localName,
				node.importClause.namedBindings.name,
			);

			// const localName = moduleRef
			statements.push({
				type: "def",
				dest: { type: "identifier", name: localName, loc: dummyLoc },
				expr: moduleRef,
				mut: false,
				attr: [],
				loc: dummyLoc,
			});
		}

		return statements;
	}
}
