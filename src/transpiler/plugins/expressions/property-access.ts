import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { validateElementAccess } from "../../utils/typeValidation.js";

export class PropertyAccessPlugin extends TranspilerPlugin {
	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		switch (true) {
			case ts.isPropertyAccessExpression(node):
				return this.convertPropertyAccessExpression(node);
			case ts.isElementAccessExpression(node):
				return this.convertElementAccessExpression(node);
		}
	};

	private convertPropertyAccessExpression(
		node: ts.PropertyAccessExpression,
	): Ast.Expression {
		const target = this.converter.convertExpressionAsExpression(
			node.expression,
		);
		const propertyName = node.name.text;

		// AiScriptの名前空間アクセス（Core.v → Core:v）の特別処理
		if (
			target.type === "identifier" &&
			this.converter.getNamespaces().includes(target.name)
		) {
			return {
				type: "identifier",
				name: `${target.name}:${propertyName}`,
				loc: dummyLoc,
			};
		}

		const access: Ast.Prop = {
			type: "prop",
			target,
			name: propertyName,
			loc: dummyLoc,
		};

		if (!node.questionDotToken) return access;

		// a?.b → { let __tmp = a; if (__tmp != null) __tmp.b else null }
		return this.wrapOptional(target, (tmp) => ({
			type: "prop",
			target: tmp,
			name: propertyName,
			loc: dummyLoc,
		}));
	}

	private convertElementAccessExpression(
		node: ts.ElementAccessExpression,
	): Ast.Index | Ast.Block {
		if (!node.argumentExpression) {
			this.converter.throwError("配列アクセスにはインデックスが必要です", node);
		}
		validateElementAccess(
			node.expression,
			node.argumentExpression,
			this.converter,
		);
		const target = this.converter.convertExpressionAsExpression(
			node.expression,
		);
		const index = this.converter.convertExpressionAsExpression(
			node.argumentExpression,
		);

		if (!node.questionDotToken) {
			return {
				type: "index",
				target,
				index,
				loc: dummyLoc,
			};
		}

		// a?.[b] → { let __tmp = a; if (__tmp != null) __tmp[b] else null }
		return this.wrapOptional(target, (tmp) => ({
			type: "index",
			target: tmp,
			index,
			loc: dummyLoc,
		}));
	}

	/** ターゲット式をnullチェック付きブロックでラップする */
	private wrapOptional(
		target: Ast.Expression,
		buildAccess: (tmp: Ast.Identifier) => Ast.Expression,
	): Ast.Block {
		const tmp = this.converter.getUniqueIdentifier();
		const def: Ast.Definition = {
			type: "def",
			dest: tmp,
			expr: target,
			mut: false,
			attr: [],
			loc: dummyLoc,
		};
		const ifExpr: Ast.If = {
			type: "if",
			cond: {
				type: "neq",
				left: tmp,
				right: { type: "null", loc: dummyLoc },
				loc: dummyLoc,
			},
			// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
			then: buildAccess(tmp),
			elseif: [],
			else: { type: "null", loc: dummyLoc },
			loc: dummyLoc,
		};
		return {
			type: "block",
			statements: [def, ifExpr],
			loc: dummyLoc,
		};
	}
}
