import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { TranspilerPlugin } from "../../base.js";
import { dummyLoc } from "../../consts.js";
import { convertBindingNameArg } from "../../utils/destructuring.js";

export class LiteralPlugin extends TranspilerPlugin {
	override tryConvertExpressionAsExpression = (
		node: ts.Expression,
	): Ast.Expression | undefined => {
		switch (true) {
			case node.kind === ts.SyntaxKind.NullKeyword:
				// null も undefined と同様に AiScript の null に変換
				return { type: "null", loc: dummyLoc };
			case node.kind === ts.SyntaxKind.TrueKeyword:
				return { type: "bool", value: true, loc: dummyLoc };
			case node.kind === ts.SyntaxKind.FalseKeyword:
				return { type: "bool", value: false, loc: dummyLoc };
			case ts.isStringLiteral(node):
				return { type: "str", value: node.text, loc: dummyLoc };
			case ts.isNumericLiteral(node):
				return this.convertNumericLiteral(node);
			case node.kind === ts.SyntaxKind.UndefinedKeyword:
				return { type: "null", loc: dummyLoc };
			case ts.isTemplateExpression(node):
				return this.convertTemplateExpression(node);
			case ts.isNoSubstitutionTemplateLiteral(node):
				return this.convertNoSubstitutionTemplateLiteral(node);
			case ts.isArrayLiteralExpression(node):
				return this.convertArrayLiteralExpression(node);
			case ts.isObjectLiteralExpression(node):
				return this.convertObjectLiteralExpression(node);
		}
	};

	private convertNumericLiteral(node: ts.NumericLiteral): Ast.Num {
		let value: number;

		if (node.text.startsWith("0x") || node.text.startsWith("0X")) {
			// 16進数
			value = parseInt(node.text, 16);
		} else if (node.text.startsWith("0b") || node.text.startsWith("0B")) {
			// 2進数
			value = parseInt(node.text.slice(2), 2);
		} else if (node.text.includes("e") || node.text.includes("E")) {
			// 指数表記
			value = parseFloat(node.text);
		} else {
			value = Number(node.text);
		}

		return { type: "num", value, loc: dummyLoc };
	}

	private convertTemplateExpression(node: ts.TemplateExpression): Ast.Tmpl {
		const elements: Ast.Expression[] = [];

		// 最初のテンプレート部分を追加
		if (node.head.text) {
			elements.push({ type: "str", value: node.head.text, loc: dummyLoc });
		}

		// 各テンプレート部分と式を交互に処理
		node.templateSpans.forEach((span) => {
			// 式部分を追加
			const expr = this.converter.convertExpressionAsExpression(
				span.expression,
			);
			elements.push(expr);
			// テンプレート部分を追加
			if (span.literal.text) {
				elements.push({ type: "str", value: span.literal.text, loc: dummyLoc });
			}
		});

		return { type: "tmpl", tmpl: elements, loc: dummyLoc };
	}

	private convertNoSubstitutionTemplateLiteral(
		node: ts.NoSubstitutionTemplateLiteral,
	): Ast.Tmpl {
		return {
			type: "tmpl",
			tmpl: [{ type: "str", value: node.text, loc: dummyLoc }],
			loc: dummyLoc,
		};
	}

	private convertArrayLiteralExpression(
		node: ts.ArrayLiteralExpression,
	): Ast.Arr | Ast.Call {
		const hasSpread = node.elements.some(ts.isSpreadElement);
		if (!hasSpread) {
			return {
				type: "arr",
				value: node.elements.map((el) =>
					this.converter.convertExpressionAsExpression(el),
				),
				loc: dummyLoc,
			};
		}
		return this.buildArrWithSpread(node.elements);
	}

	private buildArrWithSpread(elements: ts.NodeArray<ts.Expression>): Ast.Call {
		// スプレッドで区切りながらセグメントリストを作る
		const segments: Ast.Expression[] = [];
		let current: Ast.Expression[] = [];

		const flushCurrent = () => {
			if (current.length > 0) {
				segments.push({ type: "arr", value: current, loc: dummyLoc });
				current = [];
			}
		};

		for (const el of elements) {
			if (ts.isSpreadElement(el)) {
				flushCurrent();
				segments.push(
					this.converter.convertExpressionAsExpression(el.expression),
				);
			} else {
				current.push(this.converter.convertExpressionAsExpression(el));
			}
		}
		flushCurrent();

		// segments を arr.concat() で左畳み込み
		let merged: Ast.Expression | undefined;
		for (const seg of segments) {
			merged =
				merged === undefined
					? seg
					: {
							type: "call",
							target: {
								type: "prop",
								target: merged,
								name: "concat",
								loc: dummyLoc,
							},
							args: [seg],
							loc: dummyLoc,
						};
		}
		if (merged === undefined)
			throw new Error("internal: no segments in spread array");
		return merged as Ast.Call;
	}

	private convertObjectLiteralExpression(
		node: ts.ObjectLiteralExpression,
	): Ast.Obj | Ast.Call | Ast.Block {
		const hasSpread = node.properties.some(ts.isSpreadAssignment);
		const hasComputed = node.properties.some(
			(p) => ts.isPropertyAssignment(p) && ts.isComputedPropertyName(p.name),
		);
		if (!hasSpread && !hasComputed) return this.buildPlainObj(node.properties);
		// 算出キーがある場合はスプレッドの有無によらず統合ブロック方式を使う
		if (hasComputed) return this.buildDynamicObj(node.properties);
		return this.buildObjWithSpread(node.properties);
	}

	/**
	 * スプレッドや算出キーを含むオブジェクトを eval ブロックで生成する。
	 * 左から順に処理し:
	 *   - 静的キー → 蓄積して Obj:merge でまとめてフラッシュ
	 *   - 算出キー → tmp[expr] = val でフラッシュ後インデックス代入
	 *   - スプレッド → Obj:merge(tmp, spread) でフラッシュ後マージ
	 */
	private buildDynamicObj(
		props: ts.NodeArray<ts.ObjectLiteralElementLike>,
	): Ast.Block {
		const tmp = this.converter.getUniqueIdentifier();
		const statements: (Ast.Statement | Ast.Expression)[] = [
			{
				type: "def",
				dest: tmp,
				expr: { type: "obj", value: new Map(), loc: dummyLoc },
				mut: true,
				attr: [],
				loc: dummyLoc,
			},
		];
		let staticAccum = new Map<string, Ast.Expression>();

		const flushStatic = () => {
			if (staticAccum.size === 0) return;
			statements.push({
				type: "assign",
				dest: tmp,
				expr: {
					type: "call",
					target: { type: "identifier", name: "Obj:merge", loc: dummyLoc },
					args: [tmp, { type: "obj", value: staticAccum, loc: dummyLoc }],
					loc: dummyLoc,
				},
				loc: dummyLoc,
			});
			staticAccum = new Map();
		};

		for (const prop of props) {
			if (ts.isSpreadAssignment(prop)) {
				flushStatic();
				const spread = this.converter.convertExpressionAsExpression(
					prop.expression,
				);
				statements.push({
					type: "assign",
					dest: tmp,
					expr: {
						type: "call",
						target: { type: "identifier", name: "Obj:merge", loc: dummyLoc },
						args: [tmp, spread],
						loc: dummyLoc,
					},
					loc: dummyLoc,
				});
			} else if (
				ts.isPropertyAssignment(prop) &&
				ts.isComputedPropertyName(prop.name)
			) {
				flushStatic();
				statements.push({
					type: "assign",
					dest: {
						type: "index",
						target: tmp,
						index: this.converter.convertExpressionAsExpression(
							prop.name.expression,
						),
						loc: dummyLoc,
					},
					expr: this.converter.convertExpressionAsExpression(prop.initializer),
					loc: dummyLoc,
				});
			} else if (ts.isPropertyAssignment(prop)) {
				staticAccum.set(
					prop.name.getText() || "",
					this.converter.convertExpressionAsExpression(prop.initializer),
				);
			} else if (ts.isShorthandPropertyAssignment(prop)) {
				const key = prop.name.getText();
				staticAccum.set(key, { type: "identifier", name: key, loc: dummyLoc });
			} else if (ts.isMethodDeclaration(prop)) {
				staticAccum.set(
					(prop.name as ts.Identifier).text || "",
					this.convertMethodToInlineFunction(prop),
				);
			} else {
				this.converter.throwError(
					`サポートされていないオブジェクトプロパティです: ${ts.SyntaxKind[prop.kind]}`,
					prop,
				);
			}
		}
		flushStatic();
		statements.push(tmp);
		return { type: "block", statements, loc: dummyLoc };
	}

	private buildPlainObj(
		props: ts.NodeArray<ts.ObjectLiteralElementLike>,
	): Ast.Obj {
		const value = new Map<string, Ast.Expression>();
		for (const prop of props) {
			if (ts.isPropertyAssignment(prop)) {
				const key = prop.name?.getText() || "";
				const val = this.converter.convertExpressionAsExpression(
					prop.initializer,
				);
				value.set(key, val);
			} else if (ts.isShorthandPropertyAssignment(prop)) {
				const key = prop.name.getText();
				value.set(key, { type: "identifier", name: key, loc: dummyLoc });
			} else if (ts.isMethodDeclaration(prop)) {
				const key = prop.name?.getText() || "";
				value.set(key, this.convertMethodToInlineFunction(prop));
			} else {
				this.converter.throwError(
					`サポートされていないオブジェクトプロパティです: ${ts.SyntaxKind[prop.kind]}`,
					prop,
				);
			}
		}
		return { type: "obj", value, loc: dummyLoc };
	}

	private buildObjWithSpread(
		props: ts.NodeArray<ts.ObjectLiteralElementLike>,
	): Ast.Call {
		// スプレッドで区切りながらセグメントのリストを作る
		const segments: Ast.Expression[] = [];
		let current = new Map<string, Ast.Expression>();

		const flushCurrent = () => {
			if (current.size > 0) {
				segments.push({ type: "obj", value: current, loc: dummyLoc });
				current = new Map();
			}
		};

		for (const prop of props) {
			if (ts.isSpreadAssignment(prop)) {
				flushCurrent();
				segments.push(
					this.converter.convertExpressionAsExpression(prop.expression),
				);
			} else if (ts.isPropertyAssignment(prop)) {
				const key = prop.name?.getText() || "";
				current.set(
					key,
					this.converter.convertExpressionAsExpression(prop.initializer),
				);
			} else if (ts.isShorthandPropertyAssignment(prop)) {
				const key = prop.name.getText();
				current.set(key, { type: "identifier", name: key, loc: dummyLoc });
			} else if (ts.isMethodDeclaration(prop)) {
				const key = prop.name?.getText() || "";
				current.set(key, this.convertMethodToInlineFunction(prop));
			} else {
				this.converter.throwError(
					`サポートされていないオブジェクトプロパティです: ${ts.SyntaxKind[prop.kind]}`,
					prop,
				);
			}
		}
		flushCurrent();

		// segments を Obj:merge でたたみ込む（左畳み込み）
		let merged: Ast.Expression | undefined;
		for (const seg of segments) {
			merged =
				merged === undefined
					? seg
					: {
							type: "call",
							target: { type: "identifier", name: "Obj:merge", loc: dummyLoc },
							args: [merged, seg],
							loc: dummyLoc,
						};
		}
		// スプレッドがある場合は必ず1つ以上のセグメントが存在する（到達不能）
		if (merged === undefined)
			throw new Error("internal: no segments in spread object");
		return merged as Ast.Call;
	}

	private convertMethodToInlineFunction(node: ts.MethodDeclaration): Ast.Fn {
		const params: {
			dest: Ast.Identifier;
			optional: boolean;
			default?: Ast.Expression;
		}[] = [];
		const destructuringStatements: Ast.Statement[] = [];
		let _paramIndex = 0;

		for (const param of node.parameters) {
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

		// メソッド本体の変換
		let children: (Ast.Statement | Ast.Expression)[];
		if (node.body && ts.isBlock(node.body)) {
			children = [...destructuringStatements];
			for (const statement of node.body.statements) {
				children.push(
					...this.converter.convertStatementAsStatements(statement),
				);
			}
		} else {
			this.converter.throwError("メソッドにはブロック文が必要です", node);
		}

		return {
			type: "fn",
			typeParams: [],
			params,
			children,
			loc: dummyLoc,
		};
	}
}
