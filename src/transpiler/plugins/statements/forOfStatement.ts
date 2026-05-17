import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertBindingPattern } from "../../utils/destructuring.js";
import { validateArrayExpression } from "../../utils/typeValidation.js";

export class ForOfStatementPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		if (ts.isForOfStatement(node)) {
			return [this.convertForOfStatement(node)];
		}
	};

	private convertForOfStatement(node: ts.ForOfStatement): Ast.Each {
		// 配列型チェックを追加（util関数を直接使用）
		validateArrayExpression(node.expression, this.converter);
		const iterable = this.converter.convertExpressionAsExpression(
			node.expression,
		);
		const bodyStatements = this.converter.convertStatementAsStatements(
			node.statement,
		);

		if (!ts.isVariableDeclarationList(node.initializer)) {
			this.converter.throwError(
				"for-of文では変数宣言が必要です",
				node.initializer,
			);
		}

		const declaration = node.initializer.declarations[0];
		if (declaration === undefined) {
			this.converter.throwError("for-of文では変数宣言が必要です", node);
		}
		const _isMutable = Boolean(node.initializer.flags & ts.NodeFlags.Let);
		// TODO: ワンチャンconst必須かもなので調査

		// 分割代入もネイティブサポート
		const varPattern = convertBindingPattern(declaration.name);

		// body文を展開（blockの場合はその中身を取り出す）
		const flattenedBodyStatements: (Ast.Statement | Ast.Expression)[] = [];
		for (const stmt of bodyStatements) {
			if (stmt.type === "block") {
				flattenedBodyStatements.push(...stmt.statements);
			} else {
				flattenedBodyStatements.push(stmt);
			}
		}

		const forBody: Ast.Statement | Ast.Expression =
			flattenedBodyStatements.length === 1 && flattenedBodyStatements[0]
				? flattenedBodyStatements[0]
				: { type: "block", statements: flattenedBodyStatements, loc: dummyLoc };

		return {
			type: "each",
			var: varPattern,
			items: iterable,
			for: forBody,
			loc: dummyLoc,
		};
	}
}
