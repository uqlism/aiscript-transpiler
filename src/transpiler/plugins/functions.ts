import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../base.js";
import { dummyLoc } from "../consts.js";
import { convertBindingNameArg } from "../utils/destructuring.js";

type FnParam = Ast.Fn["params"][number];

export class FunctionsPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		if (ts.isFunctionDeclaration(node)) {
			return [this.convertFunctionDeclaration(node)];
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
	): Ast.Definition {
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

		const { params, destructuringStatements } = this.processParameters(
			node.parameters,
		);
		const body: (Ast.Statement | Ast.Expression)[] = [];
		for (const statement of node.body?.statements ?? []) {
			body.push(...this.converter.convertStatementAsStatements(statement));
		}

		// 分割代入の展開文を関数の最初に追加
		const finalBody = [...destructuringStatements, ...body];

		// AiScript形式の関数定義: @name(params) { ... }
		return {
			type: "def",
			dest: { type: "identifier", name, loc: dummyLoc },
			expr: {
				type: "fn",
				typeParams: [],
				params: params,
				children: finalBody,
				loc: dummyLoc,
			},
			mut: false,
			attr: [],
			loc: dummyLoc,
		};
	}

	private convertInlineFunction(
		node: ts.ArrowFunction | ts.FunctionExpression,
	): Ast.Expression {
		const { params, destructuringStatements } = this.processParameters(
			node.parameters,
		);

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

		// 分割代入の展開文を関数の最初に追加
		const finalChildren = [...destructuringStatements, ...children];

		return {
			type: "fn",
			typeParams: [],
			params: params,
			children: finalChildren,
			loc: dummyLoc,
		};
	}

	private processParameters(parameters: readonly ts.ParameterDeclaration[]): {
		params: FnParam[];
		destructuringStatements: Ast.Statement[];
	} {
		const params: FnParam[] = [];
		const destructuringStatements: Ast.Statement[] = [];
		let _paramIndex = 0;

		for (const param of parameters) {
			const isOptional = !!param.questionToken;
			const defaultValue = param.initializer
				? this.converter.convertExpressionAsExpression(param.initializer)
				: undefined;

			const [paramIdentifier, paramDestructuring] = convertBindingNameArg(
				param.name,
				false,
				this.converter,
			);
			params.push({
				dest: paramIdentifier,
				optional: isOptional,
				default: defaultValue,
			});
			destructuringStatements.push(...paramDestructuring);
			_paramIndex++;
		}

		return { params, destructuringStatements };
	}

	private hasExportModifier(node: ts.Node): boolean {
		return ts.canHaveModifiers(node) &&
			   (ts.getModifiers(node)?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ?? false);
	}
}
