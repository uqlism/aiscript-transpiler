import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { validateElementAccess } from "../../utils/typeValidation.js";

/** 副作用なく複数回評価できる単純な式かどうか */
function isSimple(expr: Ast.Expression): boolean {
	return (
		expr.type === "identifier" ||
		expr.type === "num" ||
		expr.type === "str" ||
		expr.type === "bool" ||
		expr.type === "null"
	);
}

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
	): Ast.Index | Ast.If | Ast.Block {
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

	/** ターゲット式をnullチェック付きif式でラップする。
	 *  単純な式（識別子・リテラル）なら eval ブロック不要で if のみを返す。*/
	private wrapOptional(
		target: Ast.Expression,
		buildAccess: (src: Ast.Expression) => Ast.Expression,
	): Ast.If | Ast.Block {
		const src = isSimple(target)
			? target
			: this.converter.getUniqueIdentifier();
		const ifExpr: Ast.If = {
			type: "if",
			cond: {
				type: "neq",
				left: src,
				right: { type: "null", loc: dummyLoc },
				loc: dummyLoc,
			},
			// biome-ignore lint/suspicious/noThenProperty: AiScript AST requires then property
			then: buildAccess(src),
			elseif: [],
			else: { type: "null", loc: dummyLoc },
			loc: dummyLoc,
		};
		if (src === target) return ifExpr; // 単純: eval 不要
		return {
			type: "block",
			statements: [
				{
					type: "def",
					dest: src as Ast.Identifier,
					expr: target,
					mut: false,
					attr: [],
					loc: dummyLoc,
				},
				ifExpr,
			],
			loc: dummyLoc,
		};
	}
}
