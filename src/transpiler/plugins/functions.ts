import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
import { dummyLoc } from "../consts.js";
import { processParameters } from "../utils/destructuring.js";

export class FunctionsPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		if (ts.isFunctionDeclaration(node)) {
			return this.convertFunctionDeclaration(node);
		}
	};

	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
			return this.convertInlineFunction(node);
		}
	};

	private convertFunctionDeclaration(
		node: ts.FunctionDeclaration,
	): Ast.Definition[] {
		if (this.hasDeclareModifier(node)) {
			return [];
		}
		const name = node.name?.text || "";
		if (name && node.name) {
			this.converter.validateVariableName(name, node.name);
		} else {
			this.converter.throwError("関数名がありません", node);
		}

		// export修飾子があれば、exportリストに追加
		if (this.hasExportModifier(node)) {
			this.converter.addExport(name);
		}

		const params = processParameters(node.parameters, this.converter);
		const body: (Ast.Statement | Ast.Expression)[] = [];
		for (const statement of node.body?.statements ?? []) {
			body.push(...this.converter.convertStatementAsStatements(statement));
		}

		// AiScript形式の関数定義: @name(params) { ... }
		return [
			{
				type: "def",
				dest: { type: "identifier", name, loc: dummyLoc },
				expr: {
					type: "fn",
					typeParams: [],
					params,
					children: body,
					loc: dummyLoc,
				},
				mut: false,
				attr: [],
				loc: dummyLoc,
			},
		];
	}

	private convertInlineFunction(
		node: ts.ArrowFunction | ts.FunctionExpression,
	): Ast.Expression {
		const params = processParameters(node.parameters, this.converter);

		let children: (Ast.Statement | Ast.Expression)[];

		if (ts.isBlock(node.body)) {
			// { return x + y } 形式
			children = [];
			for (const statement of node.body.statements) {
				children.push(
					...this.converter.convertStatementAsStatements(statement),
				);
			}
		} else {
			// x + y 形式（式のみ）
			const expr = this.converter.convertExpressionAsExpression(node.body);
			children = [
				{
					type: "return",
					expr,
					loc: dummyLoc,
				},
			];
		}

		return {
			type: "fn",
			typeParams: [],
			params,
			children,
			loc: dummyLoc,
		};
	}

	private hasExportModifier(node: ts.Node): boolean {
		return (
			ts.canHaveModifiers(node) &&
			(ts
				.getModifiers(node)
				?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ??
				false)
		);
	}
	private hasDeclareModifier(node: ts.Node): boolean {
		return (
			ts.canHaveModifiers(node) &&
			(ts
				.getModifiers(node)
				?.some((mod) => mod.kind === ts.SyntaxKind.DeclareKeyword) ??
				false)
		);
	}
}
