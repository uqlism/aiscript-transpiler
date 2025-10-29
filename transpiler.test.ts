import { describe, expect, test } from "bun:test";
import { type Ast, Parser } from "@syuilo/aiscript";
import { TypeScriptToAiScriptTranspiler } from "./src/index.ts";
import { AiScriptStringifier } from "./src/stringifier.ts";

const testcases = [
	{
		title: "コメントは無視",
		ts: `// これはコメントです`,
		ais: ``,
	},
	{
		title: "複数行コメントは無視",
		ts: `/* \nこれはコメントです\n */`,
		ais: ``,
	},
	{
		title: "イミュータブル（再代入不可）",
		ts: "const x = 42;",
		ais: "let x = 42;",
	},
	{
		title: "ミュータブル（再代入可能）",
		ts: "let x = 42;",
		ais: "var x = 42;",
	},
	{
		title: "[ERR] ミュータブル（再代入可能）初期値なし",
		ts: "let x;",
		err: "変数宣言には初期値が必要です",
	},
	{
		title: "文字列リテラル",
		ts: `let message = "Hello World";`,
		ais: `var message = "Hello World";`,
	},
	{
		title: "関数",
		ts: `function add(x, y) { return x + y }`,
		ais: `@add(x, y) { return x + y }`,
	},
	{
		title: "関数",
		ts: `function func(w, x?, y = 1, z?) { return "hello" }`,
		ais: `@func(w, x?, y = 1, z?) { return "hello" }`,
	},
	{
		title: "アロー関数",
		ts: `const add = (x, y) => { return x + y }`,
		ais: `let add = @(x, y) { return x + y }`,
	},
	{
		title: "アロー関数 ブロックなし",
		ts: `const add = (x, y) => x + y`,
		ais: `let add = @(x, y) { return x + y }`,
	},
	{
		title: "アロー関数 引数省略",
		ts: `const func = (w, x?, y = 1, z?) => "hello"`,
		ais: `let func = @(w, x?, y = 1, z?) { return "hello" }`,
	},
	{
		title: "匿名関数",
		ts: `const add = function(x, y) { return x + y }`,
		ais: `let add = @(x, y) { return x + y }`,
	},
	{
		title: "オブジェクトメソッド定義",
		ts: `const foo = { bar(x, y) { return x + y }}`,
		ais: `let foo = { bar: @(x, y) { return x + y } }`,
	},
	{
		title: "代入",
		ts: `let a = 0;a = 1`,
		ais: `var a = 0;a = 1`,
	},
	{
		title: "一括代入",
		ts: `let a = 0, b = 1`,
		ais: `var a = 0;var b = 1`,
	},
	{
		title: "加算代入",
		ts: `let a = 0;a += 1`,
		ais: `var a = 0;a += 1`,
	},
	{
		title: "減算代入",
		ts: `let a = 0;a -= 1`,
		ais: `var a = 0;a -= 1`,
	},
	{
		title: "分割代入-配列",
		ts: `const [a, b] = [1, 2]`,
		ais: `let _temp_00001 = [1, 2]; let a = _temp_00001[0]; let b = _temp_00001[1];`,
	},
	{
		title: "分割代入-オブジェクト",
		ts: `const { x, y } = { x: 1, y: 2 }`,
		ais: `let _temp_00001 = {x: 1, y: 2}; let x = _temp_00001.x; let y = _temp_00001.y;`,
	},
	{
		title: "分割代入-オブジェクト(名前変更)",
		ts: `const { x: a, y: b } = { x: 1, y: 2 }`,
		ais: `let _temp_00001 = {x: 1, y: 2}; let a = _temp_00001.x; let b = _temp_00001.y;`,
	},
	{
		title: "分割代入-関数の引数",
		ts: `function test([a, b] = [0, 0]){ return [a, b] }`,
		ais: `@test(_temp_00001 = [0, 0]) { let a = _temp_00001[0]; let b = _temp_00001[1]; return [a, b] }`,
	},
	{
		title: "分割代入-アロー関数の引数",
		ts: `([a, b] = [0, 0]) => [a, b]`,
		ais: `@(_temp_00001 = [0, 0]) { let a = _temp_00001[0]; let b = _temp_00001[1]; return [a, b] }`,
	},
	{
		title: "分割代入-匿名関数の引数",
		ts: `const f = function([a, b] = [0, 0]) { return [a, b] }`,
		ais: `let f = @(_temp_00001 = [0, 0]) { let a = _temp_00001[0]; let b = _temp_00001[1]; return [a, b] }`,
	},

	{
		title: "代入文-配列分割代入",
		ts: `let a = 0, b = 0; [a, b] = [1, 2]`,
		ais: `var a = 0; var b = 0; let _temp_00001 = [1, 2]; a = _temp_00001[0]; b = _temp_00001[1];`,
	},
	{
		title: "代入文-オブジェクト分割代入",
		ts: `let x = 0, y = 0; ({ x, y } = { x: 1, y: 2 })`,
		ais: `var x = 0; var y = 0; let _temp_00001 = {x: 1, y: 2}; x = _temp_00001.x; y = _temp_00001.y;`,
	},
	{
		title: "ネストした分割代入-配列内オブジェクト",
		ts: `const [a, { x, y }] = [1, { x: 2, y: 3 }]`,
		ais: `let _temp_00001 = [1, {x: 2, y: 3}]; let a = _temp_00001[0]; let x = _temp_00001[1].x; let y = _temp_00001[1].y;`,
	},
	{
		title: "ネストした分割代入-オブジェクト内配列",
		ts: `const { arr: [a, b] } = { arr: [1, 2] }`,
		ais: `let _temp_00001 = {arr: [1, 2]}; let a = _temp_00001.arr[0]; let b = _temp_00001.arr[1];`,
	},

	{
		title: "for文",
		ts: `for (let i = 3; i < 10; i+= 2) { 1; 2; }`,
		ais: `eval {var i = 3; loop { if !(i < 10) break; 1; 2; i += 2; }}`,
	},

	{
		title: "for文ブロックなし",
		ts: `for (let i = 3; i < 10; i++) undefined`,
		ais: `eval { var i = 3; loop { if !(i < 10) break; null; i += 1; }}`,
	},

	{
		title: "for文 初期化/条件/更新なし",
		ts: `for (;;) { undefined }`,
		ais: `loop { null }`,
	},

	{
		title: "for-of文",
		ts: `for (const item of arr) { item }`,
		ais: `each let item, arr item`,
	},
	{
		title: "for-of文(配列分割代入)",
		ts: `for (const [a, b] of items) { a; b; }`,
		ais: `each let _temp_00001, items { let a = _temp_00001[0]; let b = _temp_00001[1]; a; b }`,
	},
	{
		title: "for-of文(オブジェクト分割代入)",
		ts: `for (const {x, y} of items) { x; y; }`,
		ais: `each let _temp_00001, items { let x = _temp_00001.x; let y = _temp_00001.y; x; y }`,
	},

	{
		title: "while文",
		ts: `while (i < 10) { undefined }`,
		ais: `loop { if !(i < 10) break; null }`,
	},

	{
		title: "do-while文",
		ts: `do { undefined } while (i < 10)`,
		ais: `loop { null; if !(i < 10) break }`,
	},

	{
		title: "[ERR] nullリテラル",
		ts: "let value = null;",
		err: "nullは使用できません代わりにundefinedを使用してください",
	},
	{
		title: "boolリテラル",
		ts: "let x = true;let y = false;",
		ais: "var x = true;var y = false;",
	},
	{
		title: "数値リテラル",
		ts: "let n1 = 123;let n2 = -34;let n3 = 1.1",
		ais: "var n1 = 123;var n2 = -34;var n3 = 1.1;",
	},
	{
		title: "数値リテラル(変換)",
		ts: "let hex = 0x11;let bin = 0b111;let exp = 1.1e0;",
		ais: "var hex = 17;var bin = 7;var exp = 1.1;",
	},
	{
		title: "文字列リテラル",
		ts: `let s1 = 'hello"\\'';let s2 = "world\\"'";`,
		ais: `var s1 = 'hello"\\'';var s2 = "world\\"'";`,
	},
	{
		title: "テンプレートリテラル",
		ts: `let x = 'taro';let s = \`I am \${x}! {}\\\`\`;`,
		ais: `var x = 'taro';var s = \`I am {x}! \\{\\}\\\`\`;`,
	},
	{
		title: "置換なしテンプレートリテラル",
		ts: "`Hello \n world`",
		ais: "`Hello \n world`",
	},
	{
		title: "配列",
		ts: "let arr = [undefined, false, 0, ''];",
		ais: "var arr = [null, false, 0, ''];",
	},
	{
		title: "オブジェクト",
		ts: "let obj = { a: 1, b: 2 };",
		ais: "var obj = { a: 1, b: 2 };",
	},
	{
		title: "単項演算",
		ts: "let x = 1; +x; -x; !x;",
		ais: "var x = 1; +x; -x; !x;",
	},
	{
		title: "二項演算",
		ts: "7 && 6 === 5 > 4 + 3 * 2 ** -1",
		ais: "7 && ( 6 == ( 5 > ( 4 + ( 3 * ( 2 ^ (-1))))));",
	},
	{
		title: "カッコ",
		ts: "1 + (2 + 3)",
		ais: "1 + (2 + 3)",
	},
	{
		title: "If文 - 単一文",
		ts: "if (true) undefined",
		ais: "if true null",
	},
	{
		title: "If文 - ブロック",
		ts: "if (true) { 1; 2; }",
		ais: "if true { 1; 2; }",
	},
	{
		title: "If-Else文",
		ts: "if (true) 0 else {100; 200;}",
		ais: "if true 0 else {100; 200;}",
	},
	{
		title: "If-Elif-Else文",
		ts: "if (true) 0 else if (false) 100 else if (false) 200 else 300",
		ais: "if (true) 0 elif (false) 100 elif (false) 200 else 300",
	},
	{
		title: "ConditionalExpression | 三項演算子",
		ts: "const x = true ? 100 : 200",
		ais: "let x = if true 100 else 200",
	},
	{
		title: "ブロック",
		ts: "{undefined}",
		ais: "eval {null}",
	},
	{
		title: "ブロック",
		ts: "{0;1;}",
		ais: "eval {0;1;}",
	},
	{
		title: "Switch文(break/return必須)",
		ts: "() => switch (x) { case 1: 100; break; case 2: break; case 3: return undefined; default: return 3; }",
		ais: "@(){ let _temp_00001 = x; if _temp_00001 == 1 { 100 } elif _temp_00001 == 2 { } elif _temp_00001 == 3 { return null } else { return 3 }}",
	},
	{
		title: "Switch文(break/returnない場合エラー)",
		ts: "() => switch (x) { case 1: 100; }",
		err: "case節の末尾にbreakまたはreturnが必要です",
	},
	{
		title: "予約語が変数名",
		ts: "let match = 3;",
		err: "予約語を変数名にすることはできません",
	},
	{
		title: "メソッド呼び出し",
		ts: `let x = 42;x.to_str();`,
		ais: `var x = 42;x.to_str();`,
	},
	{
		title: "プロパティアクセス",
		ts: `x.foo;`,
		ais: `x.foo;`,
	},
	{
		title: "インデックスアクセス",
		ts: `x[10];x["hello"];`,
		ais: `x[10];x["hello"];`,
	},
	{
		title: "Core:v",
		ts: `Core.v;`,
		ais: `Core:v;`,
	},
	{
		title: "Date:now() 呼び出し",
		ts: `Date.now();`,
		ais: `Date:now();`,
	},
	{
		title: "Json:stringify() 呼び出し",
		ts: `Json.stringify({});`,
		ais: `Json:stringify({});`,
	},
	{
		title: "Util:uuid() 呼び出し",
		ts: `Util.uuid();`,
		ais: `Util:uuid();`,
	},
	{
		title: "Ui:root 呼び出し",
		ts: `Ui.root();`,
		ais: `Ui:root();`,
	},
	{
		title: "Ui:C:Button 呼び出し",
		ts: `Ui.C.Button();`,
		ais: `Ui:C:Button();`,
	},
	{
		title: "[ERR] if文の条件が文字列",
		ts: `if ("hello") { }`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "[ERR] if文の条件が数値",
		ts: `if (42) { }`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "[ERR] while文の条件が文字列",
		ts: `while ("hello") { }`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "[ERR] for文の条件が数値",
		ts: `for (let i = 0; 42; i++) { }`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "[ERR] do-while文の条件が文字列",
		ts: `do { } while ("test")`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "[ERR] else if文の条件が数値",
		ts: `if (true) { } else if (123) { }`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "boolean変数を使ったif文",
		ts: `let flag = true; if (flag) { }`,
		ais: `var flag = true; if flag { }`,
	},
	{
		title: "boolean比較式を使ったwhile文",
		ts: `let x = 5; while (x > 0) { x--; }`,
		ais: `var x = 5; loop { if !( x > 0) break; x -= 1 }`,
	},
	{
		title: "[ERR] 三項演算子の条件が文字列",
		ts: `const x = "hello" ? 1 : 2`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "[ERR] 三項演算子の条件が数値",
		ts: `const x = 42 ? 1 : 2`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "[ERR] ネストした三項演算子の条件が文字列",
		ts: `const x = true ? 1 : "test" ? 2 : 3`,
		err: "if文の条件式はboolean型である必要があります",
	},
	{
		title: "正常な三項演算子",
		ts: `const x = true ? 100 : 200`,
		ais: `let x = if true 100 else 200`,
	},
	{
		title: "boolean変数を使った三項演算子",
		ts: `let flag = false; const x = flag ? 1 : 0`,
		ais: `var flag = false; let x = if flag 1 else 0`,
	},
	{
		title: "無限for文 - for(;;)",
		ts: `for (;;) { break; }`,
		ais: `loop { break }`,
	},
	{
		title: "無限while文 - while(true)",
		ts: `while (true) { break; }`,
		ais: `loop { break }`,
	},
	{
		title: "無限for文 - 空のボディ",
		ts: `for (;;) { }`,
		ais: `loop { }`,
	},
	{
		title: "無限while文 - 複数文",
		ts: `while (true) { let x = 1; x++; }`,
		ais: `loop { var x = 1; x += 1 }`,
	},
	{
		title: "[ERR] for-of文の右辺が文字列",
		ts: `for (const char of "hello") { }`,
		err: "for-of文の右辺は配列型である必要があります",
	},
	{
		title: "[ERR] for-of文の右辺が数値",
		ts: `for (const item of 123) { }`,
		err: "for-of文の右辺は配列型である必要があります",
	},
	{
		title: "[ERR] for-of文の右辺がオブジェクト",
		ts: `for (const value of {a: 1, b: 2}) { }`,
		err: "for-of文の右辺は配列型である必要があります",
	},
	{
		title: "正常なfor-of文 - 配列リテラル",
		ts: `for (const item of [1, 2, 3]) { item; }`,
		ais: `each let item, [1, 2, 3] item`,
	},
	{
		title: "正常なfor-of文 - 配列変数（配列リテラル直接使用）",
		ts: `let arr = [1, 2]; for (const item of arr) { item; }`,
		ais: `var arr = [1, 2]; each let item, arr item`,
	},
	{
		title: "正常な要素アクセス - 配列[数値]",
		ts: `let arr = [1, 2, 3]; arr[0];`,
		ais: `var arr = [1, 2, 3]; arr[0];`,
	},
	{
		title: "正常な要素アクセス - オブジェクト[文字列]",
		ts: `let obj = {x: 1, y: 2}; obj["x"];`,
		ais: `var obj = {x: 1, y: 2}; obj["x"];`,
	},
	{
		title: "[ERR] 要素アクセス - 配列[文字列]",
		ts: `let arr = [1, 2, 3]; arr["test"];`,
		err: "配列のインデックスはnumber型である必要があります",
	},
	{
		title: "[ERR] 要素アクセス - オブジェクト[数値]",
		ts: `let obj = {x: 1, y: 2}; obj[0];`,
		err: "オブジェクトのインデックスはstring型である必要があります",
	},
	{
		title: "[ERR] 要素アクセス - 文字列[数値]",
		ts: `let str = "hello"; str[0];`,
		err: "要素アクセスは配列またはオブジェクトに対してのみ使用できます",
	},
	{
		title: "[ERR] 要素アクセス - 数値[数値]",
		ts: `let num = 123; num[0];`,
		err: "要素アクセスは配列またはオブジェクトに対してのみ使用できます",
	},
];

describe("TypeScript to AiScript Transpiler", () => {
	test.each(testcases)("$title", ({ ts, ais, err }) => {
		if (ais) {
			expectSameNode(
				TypeScriptToAiScriptTranspiler.transpile(ts),
				Parser.parse(ais),
			);
		}
		if (err) {
			expect(() => {
				TypeScriptToAiScriptTranspiler.transpile(ts);
			}).toThrow(err);
		}
	});
});

describe("AiScript AST to AiScript Code Stringifier", () => {
	test.each(testcases)("$title", ({ ais }) => {
		if (ais) {
			// AST -> 文字列 -> AST の変換が同一になることを確認
			expectSameNode(
				Parser.parse(AiScriptStringifier.stringify(Parser.parse(ais))),
				Parser.parse(ais),
			);
		}
	});
});

/**
 * 2つのaiscript AST が同一かどうかを検証する
 * ただし、コードの行数は無視する
 */
function expectSameNode(node1: Ast.Node[], node2: Ast.Node[]) {
	function removeLoc(node: any): any {
		if (Array.isArray(node)) {
			return node.map(removeLoc);
		}
		if (node === null) {
			return null;
		}
		if (node instanceof Map) {
			return new Map(node.entries().map(([k, v]) => [k, removeLoc(v)]));
		}
		if (node instanceof Set) {
			return new Set(node.values().map((v) => removeLoc(v)));
		}
		if (typeof node === "object") {
			return Object.fromEntries(
				Object.entries(node)
					.filter(([k, _]) => k !== "loc")
					.map(([k, v]) => [k, removeLoc(v)]),
			);
		}
		return node;
	}
	return expect(removeLoc(node1)).toEqual(removeLoc(node2));
}
