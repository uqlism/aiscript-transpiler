import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertDestructuringAssignment } from "../../utils/destructuring.js";

export class VariableStatementPlugin extends TranspilerPlugin {
	override tryConvertStatementAsStatements = (
		node: ts.Statement,
	): (Ast.Expression | Ast.Statement)[] | undefined => {
		if (ts.isVariableStatement(node)) {
			return this.convertVariableStatements(node);
		}
	};

	private convertVariableStatements(
		node: ts.VariableStatement,
	): Ast.Statement[] {
		if (this.hasDeclareModifier(node)) {
			return [];
		}

		const definitions: Ast.Statement[] = [];

		// export修飾子があるかチェック
		const hasExportModifier = this.hasExportModifier(node);

		for (const declaration of node.declarationList.declarations) {
			if (!declaration.initializer) {
				this.converter.throwError("変数宣言には初期値が必要です", declaration);
			}

			const isMutable = Boolean(node.declarationList.flags & ts.NodeFlags.Let);
			const nameNode = declaration.name;
			const expr = this.converter.convertExpressionAsExpression(
				declaration.initializer,
			);

			if (ts.isIdentifier(nameNode)) {
				// 単純な変数宣言: let x = value
				this.converter.validateVariableName(nameNode.text, nameNode);

				// export修飾子があれば、exportリストに追加
				if (hasExportModifier) {
					this.converter.addExport(nameNode.text);
				}

				definitions.push({
					type: "def",
					dest: { type: "identifier", name: nameNode.text, loc: dummyLoc },
					expr,
					mut: isMutable,
					attr: [],
					loc: dummyLoc,
				});
			} else {
				// 分割代入: let [a, b] = array; let {x, y} = object;
				// 右辺がidentifierでない場合は一時変数に保存
				let sourceExpr: Ast.Expression;
				if (expr.type === "identifier") {
					// 右辺が変数の場合はそのまま使用
					sourceExpr = expr;
				} else {
					// 右辺が関数呼び出しなど複雑な式の場合は一時変数に保存
					const tempVar = this.converter.getUniqueIdentifier();
					definitions.push({
						type: "def",
						dest: tempVar,
						expr,
						mut: false,
						attr: [],
						loc: dummyLoc,
					});
					sourceExpr = tempVar;
				}

				// 分割代入の展開
				const destructuringDefs = convertDestructuringAssignment(
					nameNode,
					sourceExpr,
					isMutable,
					this.converter,
				);
				definitions.push(...destructuringDefs);
			}
		}

		return definitions;
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
