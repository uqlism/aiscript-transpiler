import type { Ast } from "@syuilo/aiscript";
import { version } from "./transpiler/consts.js";

// AiScript パーサーの演算子優先度（低=弱く結合, 高=強く結合）
// 実測による: ! は高優先度、&& は || より高い（JS と同じ標準的な順序）
// *, /, %, ^ は同一優先度
const PREC: Partial<Record<string, number>> = {
	or: 1,
	and: 2,
	eq: 4,
	neq: 4,
	lt: 4,
	lteq: 4,
	gt: 4,
	gteq: 4,
	add: 6,
	sub: 6,
	mul: 7,
	div: 7,
	rem: 7,
	pow: 7,
	not: 8,
	plus: 8,
	minus: 8,
};

function exprPrec(node: Ast.Expression): number {
	return PREC[node.type as string] ?? 100;
}

/**
 * AiScript ASTをAiScriptコード文字列に変換するクラス
 */
export class AiScriptStringifier {
	private readonly indentStr = "  ";

	/**
	 * AiScript ASTをAiScriptコード文字列に変換する
	 */
	static stringify(nodes: Ast.Node[]): string {
		const stringifier = new AiScriptStringifier();
		const content = stringifier.stringifyNodes(nodes, 0);
		return `/// @ ${version}\n${content}`;
	}

	private stringifyNodes(nodes: Ast.Node[], indentLevel: number): string {
		return nodes
			.map((node) => this.stringifyTopLevelNode(node, indentLevel))
			.join("\n");
	}

	private stringifyTopLevelNode(node: Ast.Node, indentLevel: number): string {
		return this.stringifyNode(node, true, indentLevel);
	}

	private getIndent(indentLevel: number): string {
		return this.indentStr.repeat(indentLevel);
	}

	private stringifyNode(
		node: Ast.Node,
		blockEval: boolean,
		indentLevel: number,
	): string {
		switch (node.type) {
			case "def":
				return this.stringifyDefinition(node as Ast.Definition, indentLevel);
			case "fn":
				return this.stringifyFn(node as Ast.Fn, indentLevel);
			case "call":
				return this.stringifyCall(node as Ast.Call, indentLevel);
			case "if":
				return this.stringifyIf(node as Ast.If, indentLevel);
			case "match":
				return this.stringifyMatch(node as Ast.Match, indentLevel);
			case "loop":
				return this.stringifyLoop(node as Ast.Loop, indentLevel);
			case "each":
				return this.stringifyEach(node as Ast.Each, indentLevel);
			case "block":
				return this.stringifyBlock(node as Ast.Block, blockEval, indentLevel);
			case "assign":
				return this.stringifyAssign(node as Ast.Assign, indentLevel);
			case "addAssign":
				return this.stringifyAddAssign(node as Ast.AddAssign, indentLevel);
			case "subAssign":
				return this.stringifySubAssign(node as Ast.SubAssign, indentLevel);
			case "return":
				return this.stringifyReturn(node as Ast.Return, indentLevel);
			case "break":
				return this.stringifyBreak(node as Ast.Break);
			case "continue":
				return this.stringifyContinue(node as Ast.Continue);
			// 式の場合
			case "identifier":
				return this.stringifyIdentifier(node as Ast.Identifier);
			case "num":
				return this.stringifyNumber(node as Ast.Num);
			case "str":
				return this.stringifyString(node as Ast.Str);
			case "bool":
				return this.stringifyBoolean(node as Ast.Bool);
			case "null":
				return this.stringifyNull(node as Ast.Null);
			case "arr":
				return this.stringifyArray(node as Ast.Arr, indentLevel);
			case "obj":
				return this.stringifyObject(node as Ast.Obj, indentLevel);
			case "prop":
				return this.stringifyProperty(node as Ast.Prop, indentLevel);
			case "index":
				return this.stringifyIndex(node as Ast.Index, indentLevel);
			case "not":
				return this.stringifyNot(node as Ast.Not, indentLevel);
			case "plus":
				return this.stringifyPlus(node as Ast.Plus, indentLevel);
			case "minus":
				return this.stringifyMinus(node as Ast.Minus, indentLevel);
			case "and":
				return this.stringifyAnd(node as Ast.And, indentLevel);
			case "or":
				return this.stringifyOr(node as Ast.Or, indentLevel);
			case "add":
				return this.stringifyAdd(node as Ast.Add, indentLevel);
			case "sub":
				return this.stringifySub(node as Ast.Sub, indentLevel);
			case "mul":
				return this.stringifyMul(node as Ast.Mul, indentLevel);
			case "div":
				return this.stringifyDiv(node as Ast.Div, indentLevel);
			case "rem":
				return this.stringifyRem(node as Ast.Rem, indentLevel);
			case "pow":
				return this.stringifyPow(node as Ast.Pow, indentLevel);
			case "eq":
				return this.stringifyEq(node as Ast.Eq, indentLevel);
			case "neq":
				return this.stringifyNeq(node as Ast.Neq, indentLevel);
			case "lt":
				return this.stringifyLt(node as Ast.Lt, indentLevel);
			case "lteq":
				return this.stringifyLteq(node as Ast.Lteq, indentLevel);
			case "gt":
				return this.stringifyGt(node as Ast.Gt, indentLevel);
			case "gteq":
				return this.stringifyGteq(node as Ast.Gteq, indentLevel);
			case "tmpl":
				return this.stringifyTemplate(node as Ast.Tmpl, 0); // テンプレートリテラル内はindentLevel=0
			default:
				throw new Error(
					`サポートされていないノードタイプです: ${(node as any).type}`,
				);
		}
	}

	private stringifyExpression(
		node: Ast.Expression,
		indentLevel: number,
	): string {
		return this.stringifyNode(node, true, indentLevel);
	}

	/**
	 * 演算子の子として式を文字列化する。
	 * - isRight=false (左辺) : 自分の優先度 < 親の優先度 → ()
	 * - isRight=true  (右辺) : 自分の優先度 ≤ 親の優先度 → () (左結合の意味論を保つため)
	 */
	private childExpr(
		node: Ast.Expression,
		parentPrec: number,
		indentLevel: number,
		isRight = false,
	): string {
		const str = this.stringifyExpression(node, indentLevel);
		const p = exprPrec(node);
		return (isRight ? p <= parentPrec : p < parentPrec) ? `(${str})` : str;
	}

	private stringifyStatement(
		node: Ast.Statement | Ast.Expression,
		blockEval: boolean,
		indentLevel: number,
	): string {
		if (node.type === "block") {
			return this.stringifyBlock(node as Ast.Block, blockEval, indentLevel);
		} else {
			return this.stringifyNode(node, blockEval, indentLevel);
		}
	}

	// Core methods
	private stringifyDefinition(
		node: Ast.Definition,
		indentLevel: number,
	): string {
		// 関数定義の場合は @name(params) { ... } 形式で出力
		if (node.expr.type === "fn" && node.dest.type === "identifier") {
			const fnNode = node.expr as Ast.Fn;
			const name = (node.dest as Ast.Identifier).name;
			const params =
				fnNode.params
					?.map((param) => {
						let paramStr = this.stringifyExpression(param.dest, indentLevel);
						if (param.optional) {
							paramStr += "?";
						}
						if (param.default) {
							paramStr += ` = ${this.stringifyExpression(param.default, indentLevel)}`;
						}
						return paramStr;
					})
					.join(", ") || "";

			const body =
				fnNode.children
					?.map(
						(child) =>
							this.getIndent(indentLevel + 1) +
							this.stringifyNode(child, true, indentLevel + 1),
					)
					.join("\n") || "";

			if (body) {
				return `@${name}(${params}) {\n${body}\n${this.getIndent(indentLevel)}}`;
			} else {
				return `@${name}(${params}) {}`;
			}
		}

		// 通常の変数定義
		const keyword = node.mut ? "var" : "let";
		const dest = this.stringifyExpression(node.dest, indentLevel);
		const expr = this.stringifyExpression(node.expr, indentLevel);
		return `${keyword} ${dest} = ${expr}`;
	}

	private stringifyFn(node: Ast.Fn, indentLevel: number): string {
		const params =
			node.params
				?.map((param) => {
					let paramStr = this.stringifyExpression(param.dest, indentLevel);
					if (param.optional) {
						paramStr += "?";
					}
					if (param.default) {
						paramStr += ` = ${this.stringifyExpression(param.default, indentLevel)}`;
					}
					return paramStr;
				})
				.join(", ") || "";

		if (node.children.length === 0) {
			return `@(${params}) {}`;
		}

		const childIndent = this.getIndent(indentLevel + 1);
		const children = node.children
			.map((child) => {
				const childStr = this.stringifyNode(child, true, indentLevel + 1);
				return childIndent + childStr;
			})
			.join("\n");

		return `@(${params}) {\n${children}\n${this.getIndent(indentLevel)}}`;
	}

	private stringifyBlock(
		node: Ast.Block,
		blockEval: boolean,
		indentLevel: number,
	): string {
		if (node.statements.length === 0) {
			return blockEval ? "eval {}" : "{}";
		}

		const childIndent = this.getIndent(indentLevel + 1);
		const statements = node.statements
			.map((stmt) => {
				return childIndent + this.stringifyNode(stmt, true, indentLevel + 1);
			})
			.join("\n");

		const prefix = blockEval ? "eval " : "";
		return `${prefix}{\n${statements}\n${this.getIndent(indentLevel)}}`;
	}

	private stringifyArray(node: Ast.Arr, indentLevel: number): string {
		if (node.value.length === 0) {
			return "[]";
		}

		const elements = node.value.map((elem) =>
			this.stringifyExpression(elem, indentLevel + 1),
		);
		const hasMultilineElements = elements.some((elem) => elem.includes("\n"));

		if (hasMultilineElements) {
			return `[\n${elements.map((elem) => `${this.getIndent(indentLevel + 1)}${elem}`).join(",\n")}\n${this.getIndent(indentLevel)}]`;
		}

		return `[${elements.join(", ")}]`;
	}

	private stringifyObject(node: Ast.Obj, indentLevel: number): string {
		if (node.value.size === 0) {
			return "({})";
		}

		const entries: string[] = [];
		for (const [key, value] of node.value.entries()) {
			const keyStr = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
				? key
				: JSON.stringify(key);
			entries.push(
				`${keyStr}: ${this.stringifyExpression(value, indentLevel + 1)}`,
			);
		}
		const hasMultilineEntries = entries.some((entry) => entry.includes("\n"));

		if (hasMultilineEntries) {
			return `({\n${entries.map((x) => `${this.getIndent(indentLevel + 1)}${x}`).join(",\n")}\n${this.getIndent(indentLevel)}})`;
		}

		return `({${entries.join(", ")}})`;
	}

	private stringifyTemplate(node: Ast.Tmpl, _indentLevel: number): string {
		let result = "`";
		for (const element of node.tmpl) {
			if (element.type === "str") {
				// テンプレートリテラル内では改行を含むコンテンツをそのまま保持
				let content = element.value;
				// エスケープは常に適用（テンプレートリテラル内の特殊文字）
				content = content.replace(/`/g, "\\`").replace(/{/g, "\\{");
				result += content;
			} else {
				// テンプレートリテラル内の式を処理（インデントレベル0で処理）
				result += `{${this.stringifyNode(element, true, 0)}}`;
			}
		}
		result += "`";
		return result;
	}

	// Simple expression methods
	private stringifyCall(node: Ast.Call, indentLevel: number): string {
		const target = this.stringifyExpression(node.target, indentLevel);
		const args = node.args
			.map((arg) => this.stringifyExpression(arg, indentLevel))
			.join(", ");
		return `${target}(${args})`;
	}

	private stringifyIf(node: Ast.If, indentLevel: number): string {
		let result = `if ${this.stringifyExpression(node.cond, indentLevel)} ${this.stringifyStatement(node.then, false, indentLevel)}`;

		if (node.elseif && node.elseif.length > 0) {
			for (const elif of node.elseif) {
				result += ` elif ${this.stringifyExpression(elif.cond, indentLevel)} ${this.stringifyStatement(elif.then, false, indentLevel)}`;
			}
		}

		if (node.else) {
			result += ` else ${this.stringifyStatement(node.else, false, indentLevel)}`;
		}

		return result;
	}

	private stringifyMatch(node: Ast.Match, indentLevel: number): string {
		const about = this.stringifyExpression(node.about, indentLevel);
		const cases = node.qs.map(
			(q) =>
				`case ${this.stringifyExpression(q.q, indentLevel)} => ${this.stringifyNode(q.a, false, indentLevel)}`,
		);
		const defaultCase = node.default
			? `default => ${this.stringifyNode(node.default, false, indentLevel)}`
			: "";

		const allCases = [...cases];
		if (defaultCase) {
			allCases.push(defaultCase);
		}

		return `match (${about}) { ${allCases.join(", ")} }`;
	}

	private stringifyLoop(node: Ast.Loop, indentLevel: number): string {
		const statements = node.statements
			.map((stmt) => this.stringifyNode(stmt, true, indentLevel + 1))
			.map((x) => `${this.getIndent(indentLevel + 1)}${x}`)
			.join("\n");
		if (statements.includes("\n")) {
			return `loop {\n${statements}\n${this.getIndent(indentLevel)}}`;
		}
		return `loop { ${statements} }`;
	}

	private stringifyEach(node: Ast.Each, indentLevel: number): string {
		const varName = this.stringifyExpression(node.var, indentLevel);
		const items = this.stringifyExpression(node.items, indentLevel);
		const body = this.stringifyStatement(node.for, false, indentLevel);
		return `each let ${varName}, ${items} ${body}`;
	}

	// Assignment methods
	private stringifyAssign(node: Ast.Assign, indentLevel: number): string {
		const dest = this.stringifyExpression(node.dest, indentLevel);
		const expr = this.stringifyExpression(node.expr, indentLevel);
		return `${dest} = ${expr}`;
	}

	private stringifyAddAssign(node: Ast.AddAssign, indentLevel: number): string {
		const dest = this.stringifyExpression(node.dest, indentLevel);
		const expr = this.stringifyExpression(node.expr, indentLevel);
		return `${dest} += ${expr}`;
	}

	private stringifySubAssign(node: Ast.SubAssign, indentLevel: number): string {
		const dest = this.stringifyExpression(node.dest, indentLevel);
		const expr = this.stringifyExpression(node.expr, indentLevel);
		return `${dest} -= ${expr}`;
	}

	private stringifyReturn(node: Ast.Return, indentLevel: number): string {
		const expr = this.stringifyExpression(node.expr, indentLevel);
		return `return ${expr}`;
	}

	private stringifyBreak(_node: Ast.Break): string {
		return "break";
	}

	private stringifyContinue(_node: Ast.Continue): string {
		return "continue";
	}

	// Basic literals
	private stringifyIdentifier(node: Ast.Identifier): string {
		return node.name;
	}

	private stringifyNumber(node: Ast.Num): string {
		if (node.value < 0) {
			return `(${node.value.toString()})`;
		}
		return node.value.toString();
	}

	private stringifyString(node: Ast.Str): string {
		const escaped = node.value
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/\n/g, "\\n")
			.replace(/\r/g, "\\r")
			.replace(/\t/g, "\\t");
		return `"${escaped}"`;
	}

	private stringifyBoolean(node: Ast.Bool): string {
		return node.value ? "true" : "false";
	}

	private stringifyNull(_node: Ast.Null): string {
		return "null";
	}

	// Access methods
	private stringifyProperty(node: Ast.Prop, indentLevel: number): string {
		const target = this.stringifyExpression(node.target, indentLevel);
		return `${target}.${node.name}`;
	}

	private stringifyIndex(node: Ast.Index, indentLevel: number): string {
		const target = this.stringifyExpression(node.target, indentLevel);
		const index = this.stringifyExpression(node.index, indentLevel);
		return `${target}[${index}]`;
	}

	// Unary operators
	// ! は高優先度（!i < 10 → (!i) < 10）なので、
	// 低優先度の子（二項演算子など）には () が必要
	private stringifyNot(node: Ast.Not, indentLevel: number): string {
		return `!${this.childExpr(node.expr, 8, indentLevel)}`;
	}

	private stringifyPlus(node: Ast.Plus, indentLevel: number): string {
		return `+${this.childExpr(node.expr, 8, indentLevel)}`;
	}

	private stringifyMinus(node: Ast.Minus, indentLevel: number): string {
		return `-${this.childExpr(node.expr, 8, indentLevel)}`;
	}

	// Binary operators（外側の () は不要、子は childExpr で優先度に従ってラップ）
	private stringifyAnd(node: Ast.And, indentLevel: number): string {
		const P = 2; // and > or
		return `${this.childExpr(node.left, P, indentLevel)} && ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyOr(node: Ast.Or, indentLevel: number): string {
		const P = 1;
		return `${this.childExpr(node.left, P, indentLevel)} || ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyAdd(node: Ast.Add, indentLevel: number): string {
		const P = 6;
		return `${this.childExpr(node.left, P, indentLevel)} + ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifySub(node: Ast.Sub, indentLevel: number): string {
		const P = 6;
		return `${this.childExpr(node.left, P, indentLevel)} - ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyMul(node: Ast.Mul, indentLevel: number): string {
		const P = 7;
		return `${this.childExpr(node.left, P, indentLevel)} * ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyDiv(node: Ast.Div, indentLevel: number): string {
		const P = 7;
		return `${this.childExpr(node.left, P, indentLevel)} / ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyRem(node: Ast.Rem, indentLevel: number): string {
		const P = 7;
		return `${this.childExpr(node.left, P, indentLevel)} % ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyPow(node: Ast.Pow, indentLevel: number): string {
		const P = 7;
		return `${this.childExpr(node.left, P, indentLevel)} ^ ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	// Comparison operators
	private stringifyEq(node: Ast.Eq, indentLevel: number): string {
		const P = 4;
		return `${this.childExpr(node.left, P, indentLevel)} == ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyNeq(node: Ast.Neq, indentLevel: number): string {
		const P = 4;
		return `${this.childExpr(node.left, P, indentLevel)} != ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyLt(node: Ast.Lt, indentLevel: number): string {
		const P = 4;
		return `${this.childExpr(node.left, P, indentLevel)} < ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyLteq(node: Ast.Lteq, indentLevel: number): string {
		const P = 4;
		return `${this.childExpr(node.left, P, indentLevel)} <= ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyGt(node: Ast.Gt, indentLevel: number): string {
		const P = 4;
		return `${this.childExpr(node.left, P, indentLevel)} > ${this.childExpr(node.right, P, indentLevel, true)}`;
	}

	private stringifyGteq(node: Ast.Gteq, indentLevel: number): string {
		const P = 4;
		return `${this.childExpr(node.left, P, indentLevel)} >= ${this.childExpr(node.right, P, indentLevel, true)}`;
	}
}
