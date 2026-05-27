import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { REGEX_COMPILE_FN } from "../../base.js";

export class RegExpPlugin extends TranspilerPlugin {
	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		// /pattern/flags リテラル
		if (ts.isRegularExpressionLiteral(node)) {
			return this.convertRegexLiteral(node);
		}
		// new RegExp(pattern, flags)
		if (
			ts.isNewExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "RegExp"
		) {
			return this.convertNewRegExp(node);
		}
	};

	private convertRegexLiteral(node: ts.RegularExpressionLiteral): Ast.Identifier {
		const raw = node.text; // e.g. "/foo+/gi"
		const lastSlash = raw.lastIndexOf("/");
		const pattern = raw.slice(1, lastSlash);
		const flags = raw.slice(lastSlash + 1);

		// エスケープシーケンスはそのまま保持（AiScript側で解釈する）
		return this.converter.registerRegexLiteral(pattern, flags);
	}

	private convertNewRegExp(node: ts.NewExpression): Ast.Call {
		// new RegExp(pattern) or new RegExp(pattern, flags)
		const args = node.arguments ?? [];
		const patternArg = args[0];
		if (!patternArg) {
			this.converter.throwError(
				"new RegExp() には少なくとも1つの引数が必要です",
				node,
			);
		}
		const patternExpr = this.converter.convertExpressionAsExpression(patternArg);
		const flagsArg = args[1];
		const flagsExpr: Ast.Expression =
			flagsArg !== undefined
				? this.converter.convertExpressionAsExpression(flagsArg)
				: { type: "str", value: "", loc: dummyLoc };

		// 動的パターンなので毎回コンパイル（ホイスト不可）
		return {
			type: "call",
			target: { type: "identifier", name: REGEX_COMPILE_FN, loc: dummyLoc },
			args: [patternExpr, flagsExpr],
			loc: dummyLoc,
		};
	}
}
