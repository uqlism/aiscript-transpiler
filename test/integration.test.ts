import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { Interpreter, Parser, type values } from "@syuilo/aiscript";
import ts from "typescript";
import { TypeScriptToAiScriptTranspiler } from "../src/index.ts";
import { AiScriptStringifier } from "../src/stringifier.ts";

// ─── AiScript 値 → 比較用プレーン値 ────────────────────────────

function aisToPlain(v: values.Value | null | undefined): unknown {
	if (v == null) return null;
	switch (v.type) {
		case "null":
			return null;
		case "bool":
		case "num":
		case "str":
			return v.value;
		case "arr":
			return v.value.map(aisToPlain);
		case "obj": {
			const obj: Record<string, unknown> = {};
			for (const [k, val] of v.value) obj[k] = aisToPlain(val);
			return obj;
		}
		default:
			return `<${v.type}>`;
	}
}

// JS 値を正規化（undefined → null、AiScript に undefined がないため）
function jsNorm(v: unknown): unknown {
	if (v === undefined || v === null) return null;
	if (Array.isArray(v)) return v.map(jsNorm);
	if (typeof v === "object") {
		const obj: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v)) obj[k] = jsNorm(val);
		return obj;
	}
	return v;
}

// ─── 評価ヘルパー ───────────────────────────────────────────────

const aiscriptDts = fs.readFileSync("./types/aiscript.d.ts", "utf8");

function transpileTs(tsCode: string): string {
	const files = {
		"temp.ts": ts.createSourceFile(
			"temp.ts",
			tsCode,
			ts.ScriptTarget.Latest,
			true,
		),
		"aiscript.d.ts": ts.createSourceFile(
			"aiscript.d.ts",
			aiscriptDts,
			ts.ScriptTarget.Latest,
			true,
		),
	};
	const program = ts.createProgram(
		["temp.ts", "aiscript.d.ts"],
		{ nolib: true, types: [] },
		{
			getSourceFile: (n) => (files as Record<string, ts.SourceFile>)[n],
			writeFile: () => {},
			getCurrentDirectory: () => process.cwd(),
			getDirectories: () => [],
			fileExists: (n) => n in files,
			readFile: () => undefined,
			getCanonicalFileName: (n) => n,
			useCaseSensitiveFileNames: () => true,
			getNewLine: () => "\n",
			getDefaultLibFileName: () => "aiscript.d.ts",
		},
	);
	const ast = new TypeScriptToAiScriptTranspiler().transpileProgram(
		program,
		files["temp.ts"],
		false, // 型チェックスキップ（型推論が不要なケースのため）
	);
	return AiScriptStringifier.stringify(ast);
}

function evalAsAis(tsCode: string): unknown {
	const aisCode = transpileTs(tsCode);
	const interpreter = new Interpreter({});
	const result = interpreter.execSync(Parser.parse(aisCode));
	return aisToPlain(result);
}

function evalAsJs(expr: string): unknown {
	// new Function で独立したスコープで評価
	return jsNorm(new Function(`"use strict"; return (${expr})`)());
}

// ─── テストケース ───────────────────────────────────────────────

const cases: { title: string; expr: string }[] = [
	// 算術演算
	{ title: "加算", expr: "1 + 2" },
	{ title: "減算", expr: "10 - 3" },
	{ title: "乗算", expr: "4 * 5" },
	{ title: "除算", expr: "10 / 4" },
	{ title: "剰余", expr: "10 % 3" },
	{ title: "べき乗", expr: "2 ** 10" },
	{ title: "負数", expr: "-5" },

	// 比較演算
	{ title: "等値 true", expr: "1 === 1" },
	{ title: "等値 false", expr: "1 === 2" },
	{ title: "不等値 true", expr: "1 !== 2" },
	{ title: "不等値 false", expr: "1 !== 1" },
	{ title: "小なり true", expr: "1 < 2" },
	{ title: "小なり false", expr: "2 < 1" },
	{ title: "大なり true", expr: "3 > 2" },
	{ title: "以下 (等値)", expr: "2 <= 2" },
	{ title: "以上 (等値)", expr: "3 >= 3" },

	// 論理演算
	{ title: "AND true && true", expr: "true && true" },
	{ title: "AND true && false", expr: "true && false" },
	{ title: "OR false || true", expr: "false || true" },
	{ title: "OR false || false", expr: "false || false" },
	{ title: "NOT true", expr: "!true" },
	{ title: "NOT false", expr: "!false" },

	// 三項演算子
	{ title: "三項 condition=true", expr: "true ? 10 : 20" },
	{ title: "三項 condition=false", expr: "false ? 10 : 20" },
	{ title: "三項 ネスト", expr: "true ? (false ? 1 : 2) : 3" },

	// 文字列
	{ title: "テンプレートリテラル 数値埋め込み", expr: "`result: ${1 + 2}`" },
	{
		title: "テンプレートリテラル 文字列埋め込み",
		expr: "`hello ${true ? 'world' : 'ais'}`",
	},

	// 配列
	{ title: "配列アクセス [0]", expr: "[10, 20, 30][0]" },
	{ title: "配列アクセス [2]", expr: "[10, 20, 30][2]" },
	{ title: "配列リテラル", expr: "[1, 2, 3]" },
	{ title: "空配列", expr: "[]" },
	{ title: "配列スプレッド", expr: "[...[1, 2], 3]" },

	// オブジェクト
	{ title: "オブジェクトプロパティアクセス", expr: "({ a: 1, b: 2 }).b" },
	{ title: "オブジェクトリテラル", expr: "({ x: 10, y: 20 })" },
	{ title: "オブジェクトスプレッド", expr: "({ a: 1, ...({ b: 2 }), c: 3 })" },

	// 変数・スコープ
	{
		title: "変数束縛と演算",
		expr: "(() => { const x = 5; const y = 3; return x + y; })()",
	},
	{
		title: "変数の再代入",
		expr: "(() => { let x = 1; x = x + 1; return x; })()",
	},

	// 関数
	{ title: "アロー関数", expr: "((x) => x * 2)(5)" },
	{ title: "アロー関数 2引数", expr: "((x, y) => x + y)(3, 4)" },
	{ title: "アロー関数 式本体", expr: "((x) => x > 0)(1)" },
	{
		title: "関数 デフォルト引数",
		expr: "((x, y = 10) => x + y)(5)",
	},
	{
		title: "高階関数",
		expr: "((f) => f(3))((x) => x * x)",
	},

	// ループ
	{
		title: "for ループ",
		expr: "(() => { let s = 0; for (let i = 1; i <= 5; i++) s = s + i; return s; })()",
	},
	{
		title: "while ループ",
		expr: "(() => { let x = 1; while (x < 100) x = x * 2; return x; })()",
	},

	// Nullish / optional
	{ title: "?? nullの場合", expr: "undefined ?? 42" },
	{ title: "?? 非nullの場合", expr: "5 ?? 42" },
	{ title: "?. 存在する", expr: "({ a: 42 })?.a" },
	{ title: "?. nullの場合", expr: "undefined?.a" },
	{ title: "?. + ?? の組み合わせ", expr: "undefined?.a ?? 99" },
	{
		title: "??= 代入 (null時)",
		expr: "(() => { let x = undefined; x ??= 42; return x; })()",
	},
	{
		title: "??= 代入 (非null時)",
		expr: "(() => { let x = 10; x ??= 42; return x; })()",
	},

	// 分割代入
	{
		title: "配列分割代入",
		expr: "(() => { const [a, b] = [10, 20]; return a + b; })()",
	},
	{
		title: "オブジェクト分割代入",
		expr: "(() => { const { x, y } = { x: 3, y: 4 }; return x + y; })()",
	},
	{
		title: "配列分割代入 デフォルト値",
		expr: "(() => { const [a = 99, b = 88] = [1]; return a + b; })()",
	},
	{
		title: "配列分割代入 rest",
		expr: "(() => { const [first, ...rest] = [1, 2, 3]; return rest[0]; })()",
	},

	// in 演算子
	{
		title: "in 演算子 存在する",
		expr: '(() => { const o = { a: 1 }; return "a" in o; })()',
	},
	{
		title: "in 演算子 存在しない",
		expr: '(() => { const o = { a: 1 }; return "b" in o; })()',
	},

	// ─── 演算子優先度 ────────────────────────────────────────────────

	// 算術: mul > add
	{ title: "優先度: 乗算が加算より強い", expr: "2 + 3 * 4" }, // 14
	{ title: "優先度: 括弧で加算を先に", expr: "(2 + 3) * 4" }, // 20
	{ title: "優先度: 除算が加算より強い", expr: "10 + 6 / 3" }, // 12
	{ title: "優先度: 複合算術式", expr: "2 + 3 * 4 - 1" }, // 13

	// 算術: 左結合
	{ title: "左結合: 減算チェーン", expr: "10 - 3 - 2" }, // 5 (not 9)
	{ title: "左結合: 除算チェーン", expr: "60 / 3 / 4" }, // 5 (not 80)
	{ title: "左結合: 加減混合", expr: "5 + 3 - 2" }, // 6
	{ title: "右辺に括弧: 減算", expr: "10 - (3 - 2)" }, // 9 (not 5)
	{ title: "右辺に括弧: 除算", expr: "60 / (3 / 4)" }, // 80 (not 5) — 浮動小数点に注意

	// べき乗と右結合
	{ title: "優先度: べき乗が乗算より強い", expr: "2 * 3 ** 2" }, // 18
	{ title: "右結合: べき乗チェーン", expr: "2 ** 3 ** 2" }, // 512 (= 2 ** (3**2))

	// 比較: compare > &&/||
	{ title: "優先度: 比較が&&より強い (left)", expr: "1 + 2 === 3 && 4 > 2" }, // true
	{ title: "優先度: 比較が&&より強い (right)", expr: "4 > 2 && 1 + 2 === 3" }, // true
	{ title: "優先度: 複合比較と論理", expr: "2 * 3 > 5 && 4 + 1 < 10" }, // true

	// 単項否定の優先度 (not は比較より強い)
	{ title: "優先度: !は比較より強い", expr: "!false === true" }, // true: (!false) === true
	{ title: "優先度: !(比較式)", expr: "!(3 > 2)" }, // false
	{ title: "優先度: !(等値式)", expr: "!(1 === 1)" }, // false
	{ title: "優先度: !(算術比較)", expr: "!(1 + 2 === 3)" }, // false
	{ title: "優先度: !と&&の組み合わせ", expr: "!false && !false" }, // true
	{ title: "優先度: !!ダブル否定", expr: "!!true" }, // true
	{ title: "優先度: !!false", expr: "!!false" }, // false

	// &&/|| の組み合わせ（JSと同じ結果になるか確認）
	// TS/JS では && > ||。AiScript では同優先度（左結合）だが
	// stringifier が括弧を補うので結果は同じになる
	{ title: "優先度: &&が||より強い (左)", expr: "false && true || true" }, // true
	{ title: "優先度: &&が||より強い (右)", expr: "true || false && false" }, // true
	{ title: "優先度: 括弧で||を先に", expr: "(true || false) && false" }, // false

	// 比較と否定の組み合わせ
	{ title: "優先度: 否定と比較混在", expr: "!false && 3 > 1" }, // true
	{ title: "優先度: 否定と等値", expr: "!false === !false" }, // true: (true === true)
];

describe("Integration: JS と AiScript の評価結果が一致", () => {
	test.each(cases)("$title", ({ expr }) => {
		const jsResult = evalAsJs(expr);
		const aisResult = evalAsAis(expr);
		expect(aisResult).toEqual(jsResult);
	});
});
