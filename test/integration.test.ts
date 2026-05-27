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
		{ nolib: true, types: [], strictNullChecks: true },
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
		true, // 型チェック有効（正確なポリフィル選択に必要）
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

	// ─── 非 boolean 値の || / && ─────────────────────────────────────
	// JS では || / && はオペランドの値をそのまま返す（短絡評価）
	// AiScript では coerceToBool で真偽値化してから and/or を返すため
	// 両辺が truthy/falsy boolean に落ちると boolean になってしまう可能性がある

	// || の左辺が truthy → 左辺の値を返す
	{ title: "非bool OR: truthy文字列 || 文字列", expr: '"a" || "b"' },          // JS: "a"
	{ title: "非bool OR: truthy数値 || 数値", expr: "1 || 2" },                   // JS: 1
	{ title: "非bool OR: true || 数値", expr: "true || 42" },                     // JS: true

	// || の左辺が falsy → 右辺の値を返す
	{ title: "非bool OR: falsy空文字 || 文字列", expr: '"" || "fallback"' },      // JS: "fallback"
	{ title: "非bool OR: 0 || 数値", expr: "0 || 42" },                           // JS: 42
	{ title: "非bool OR: false || 文字列", expr: 'false || "fallback"' },         // JS: "fallback"
	// null リテラルは AiScript 非対応のため除外。undefined を使用すること。
	{ title: "非bool OR: undefined || 文字列", expr: 'undefined || "fallback"' }, // JS: "fallback"

	// && の左辺が truthy → 右辺の値を返す
	{ title: "非bool AND: truthy文字列 && 文字列", expr: '"a" && "b"' },          // JS: "b"
	{ title: "非bool AND: truthy数値 && 数値", expr: "5 && 3" },                  // JS: 3
	{ title: "非bool AND: true && 文字列", expr: 'true && "hello"' },             // JS: "hello"
	{ title: "非bool AND: true && 数値", expr: "true && 42" },                    // JS: 42

	// && の左辺が falsy → 左辺の値を返す
	{ title: "非bool AND: 0 && 文字列", expr: '0 && "b"' },                       // JS: 0
	{ title: "非bool AND: 空文字 && 文字列", expr: '"" && "b"' },                  // JS: ""
	{ title: "非bool AND: false && 数値", expr: "false && 42" },                  // JS: false
	// null リテラルは AiScript 非対応のため除外

	// 短絡評価の副作用テストは「式中代入」が未サポートのためスキップ

	// ─── ||= と &&= ─────────────────────────────────────────────────
	{
		title: "||= 数値: falsy時に代入される",
		expr: "(() => { let x = 0; x ||= 42; return x; })()",                     // JS: 42
	},
	{
		title: "||= 数値: truthy時は代入されない",
		expr: "(() => { let x = 5; x ||= 42; return x; })()",                     // JS: 5
	},
	{
		title: "&&= 数値: truthy時に代入される",
		expr: "(() => { let x = 5; x &&= 42; return x; })()",                     // JS: 42
	},
	{
		title: "&&= 数値: falsy時は代入されない",
		expr: "(() => { let x = 0; x &&= 42; return x; })()",                     // JS: 0
	},

	// ─── 文字列演算 ───────────────────────────────────────────────────
	// 注: AiScript の + / < / > は数値専用のため文字列連結・文字列大小比較は非対応
	{ title: "文字列比較 ===", expr: '"abc" === "abc"' },                          // true
	{ title: "文字列比較 !==", expr: '"abc" !== "xyz"' },                          // true

	// ─── 再帰関数 ─────────────────────────────────────────────────────
	// 注: evalAsJs は new Function で動くため TypeScript 型注釈は使えない
	{
		title: "再帰: 階乗 5!",
		expr: "(() => { const fact = (n) => n <= 1 ? 1 : n * fact(n - 1); return fact(5); })()",
	},
	{
		title: "再帰: フィボナッチ fib(7)",
		expr: "(() => { const fib = (n) => n <= 1 ? n : fib(n - 1) + fib(n - 2); return fib(7); })()",
	},

	// ─── for...of ────────────────────────────────────────────────────
	{
		title: "for...of 配列の合計",
		expr: "(() => { let s = 0; for (const x of [1, 2, 3, 4, 5]) s += x; return s; })()",
	},
	{
		title: "for...of 最大値",
		expr: "(() => { let m = 0; for (const x of [3, 1, 4, 1, 5, 9, 2]) if (x > m) m = x; return m; })()",
	},

	// ─── switch 文 ────────────────────────────────────────────────────
	// 注: トランスパイラーは各 case 末尾に break/return が必須
	{
		title: "switch: マッチするケース",
		expr: '(() => { let r = "none"; switch (2) { case 1: r = "one"; break; case 2: r = "two"; break; default: r = "other"; break; } return r; })()',
	},
	{
		title: "switch: default ケース",
		expr: '(() => { let r = "none"; switch (99) { case 1: r = "one"; break; case 2: r = "two"; break; default: r = "other"; break; } return r; })()',
	},

	// ─── ネストしたクロージャー ──────────────────────────────────────
	{
		title: "クロージャー: カウンター",
		expr: "(() => { const makeCounter = () => { let n = 0; return () => ++n; }; const c = makeCounter(); c(); c(); return c(); })()",
	},
	{
		title: "クロージャー: 加算器",
		expr: "((add) => add(3)(4))((x) => (y) => x + y)",
	},

	// ─── ネストしたアクセス ───────────────────────────────────────────
	// 注: AiScript は arr.length を持たない（Core:len() を使用）ため length テストは除外
	{
		title: "ネストした配列アクセス",
		expr: "[[1, 2], [3, 4]][1][0]",
	},
	{
		title: "ネストしたオブジェクトアクセス",
		expr: "({ a: { b: { c: 42 } } }).a.b.c",
	},
];

describe("Integration: JS と AiScript の評価結果が一致", () => {
	test.each(cases)("$title", ({ expr }) => {
		const jsResult = evalAsJs(expr);
		const aisResult = evalAsAis(expr);
		expect(aisResult).toEqual(jsResult);
	});
});

// ─── RegExp テスト ─────────────────────────────────────────────────────────────
// RegExp の API は AiScript 独自 (regex.test/exec/replace/split 等) なので
// evalAsJs との比較ではなく evalAsAis と期待値の比較で検証する

describe("Integration: RegExp", () => {
	type RegexCase = { title: string; ts: string; expected: unknown };
	const regexCases: RegexCase[] = [
		// ── test() ────────────────────────────────────────────────────────
		{
			title: "test: マッチする",
			ts: "const r = /hello/; r.test('hello world')",
			expected: true,
		},
		{
			title: "test: マッチしない",
			ts: "const r = /xyz/; r.test('hello world')",
			expected: false,
		},
		{
			title: "test: 大文字小文字無視 (i フラグ)",
			ts: "const r = /HELLO/i; r.test('hello world')",
			expected: true,
		},
		{
			title: "test: 数字クラス \\d+",
			ts: "const r = /^\\d+$/; r.test('12345')",
			expected: true,
		},
		{
			title: "test: \\d+ 非マッチ",
			ts: "const r = /^\\d+$/; r.test('123a5')",
			expected: false,
		},

		// ── exec() ────────────────────────────────────────────────────────
		{
			title: "exec: マッチしない → null",
			ts: "const r = /xyz/; r.exec('hello') === null",
			expected: true,
		},
		{
			title: "exec: 全体マッチ [0]",
			ts: "const r = /hel+o/; const m = r.exec('hello world'); m![0]",
			expected: "hello",
		},
		{
			title: "exec: index",
			ts: "const r = /world/; const m = r.exec('hello world'); m!.index",
			expected: 6,
		},
		{
			title: "exec: キャプチャグループ",
			ts: "const r = /(\\w+)\\s(\\w+)/; const m = r.exec('hello world'); m![1]",
			expected: "hello",
		},
		{
			title: "exec: キャプチャグループ 2",
			ts: "const r = /(\\w+)\\s(\\w+)/; const m = r.exec('hello world'); m![2]",
			expected: "world",
		},
		{
			title: "exec: 名前付きグループ",
			ts: "const r = /(?<first>\\w+)\\s(?<second>\\w+)/; const m = r.exec('hello world'); m!.groups!['first']",
			expected: "hello",
		},
		{
			title: "exec: 名前付きグループ second",
			ts: "const r = /(?<first>\\w+)\\s(?<second>\\w+)/; const m = r.exec('hello world'); m!.groups!['second']",
			expected: "world",
		},

		// ── replace() ────────────────────────────────────────────────────
		{
			title: "replace: 最初のマッチを置換",
			ts: "const r = /o/; r.replace('foobar', 'X')",
			expected: "fXobar",
		},
		{
			title: "replace: グローバル置換 (g フラグ)",
			ts: "const r = /o/g; r.replace('foobar', 'X')",
			expected: "fXXbar",
		},
		{
			title: "replace: スペースをハイフンに",
			ts: "const r = /\\s+/g; r.replace('hello world foo', '-')",
			expected: "hello-world-foo",
		},

		// ── replaceWith() ────────────────────────────────────────────────
		{
			title: "replaceWith: コールバックで置換",
			ts: "const r = /\\d+/g; r.replaceWith('a1b22c333', (m, _g, _i, _s) => '[' + m + ']')",
			expected: "a[1]b[22]c[333]",
		},

		// ── split() ──────────────────────────────────────────────────────
		{
			title: "split: カンマで分割",
			ts: "const r = /,/; r.split('a,b,c')",
			expected: ["a", "b", "c"],
		},
		{
			title: "split: 空白で分割",
			ts: "const r = /\\s+/; r.split('hello   world  foo')",
			expected: ["hello", "world", "foo"],
		},
		{
			title: "split: limit あり",
			ts: "const r = /,/; r.split('a,b,c,d', 2)",
			expected: ["a", "b"],
		},

		// ── execAll() ────────────────────────────────────────────────────
		{
			title: "execAll: 全マッチの [0]",
			ts: "const r = /\\d+/g; r.execAll('a1b22c333').map((m) => m[0])",
			expected: ["1", "22", "333"],
		},
		{
			title: "execAll: 全マッチの index",
			ts: "const r = /\\d+/g; r.execAll('a1b22c333').map((m) => m.index)",
			expected: [1, 3, 6],
		},

		// ── 量詞 ────────────────────────────────────────────────────────
		{
			title: "量詞: ? (ゼロまたは1回)",
			ts: "const r = /colou?r/; r.test('color')",
			expected: true,
		},
		{
			title: "量詞: + (1回以上)",
			ts: "const r = /^a+$/; r.test('aaa')",
			expected: true,
		},
		{
			title: "量詞: * (0回以上)",
			ts: "const r = /^a*$/; r.test('')",
			expected: true,
		},
		{
			title: "量詞: {n} 固定回数",
			ts: "const r = /^a{3}$/; r.test('aaa')",
			expected: true,
		},
		{
			title: "量詞: {n,m} 範囲",
			ts: "const r = /^a{2,4}$/; r.test('aaa')",
			expected: true,
		},
		{
			title: "量詞: {n,m} 範囲外",
			ts: "const r = /^a{2,4}$/; r.test('aaaaa')",
			expected: false,
		},

		// ── アンカー ─────────────────────────────────────────────────────
		{
			title: "アンカー: ^ マルチライン",
			ts: "const r = /^bar/m; r.test('foo\\nbar')",
			expected: true,
		},
		{
			title: "アンカー: $ マルチライン",
			ts: "const r = /foo$/m; r.test('foo\\nbar')",
			expected: true,
		},

		// ── 文字クラス ───────────────────────────────────────────────────
		{
			title: "文字クラス: [a-z]",
			ts: "const r = /^[a-z]+$/; r.test('hello')",
			expected: true,
		},
		{
			title: "文字クラス: 否定 [^0-9]",
			ts: "const r = /^[^0-9]+$/; r.test('abc')",
			expected: true,
		},
		{
			title: "文字クラス: 否定 非マッチ",
			ts: "const r = /^[^0-9]+$/; r.test('abc1')",
			expected: false,
		},

		// ── source / flags プロパティ ────────────────────────────────────
		{
			title: "source プロパティ",
			ts: "const r = /hello/gi; r.source",
			expected: "hello",
		},
		{
			title: "flags プロパティ",
			ts: "const r = /hello/gi; r.flags",
			expected: "gi",
		},
	];

	test.each(regexCases)("$title", ({ ts: tsCode, expected }) => {
		const result = evalAsAis(tsCode);
		expect(result).toEqual(expected);
	});
});
