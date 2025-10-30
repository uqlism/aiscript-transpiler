import { describe, expect, test } from "bun:test";
import assert from "node:assert";
import { TypeScriptToAiScriptTranspiler } from "./src/transpiler/main";
import { TranspilerError } from "./src/transpiler/base";
import ts from "typescript";
import fs from "fs";
import { AiScriptStringifier } from "./src/stringifier";
import { Parser } from "@syuilo/aiscript";

const testCases = [
	{
		title: "単一ファイルの基本的な変換",
		modules: {
			main: `
        const message = "Hello, World!";
        const number = 42;
        print(message, number);
      `,
		},
		expected: `
      let message = "Hello, World!";
      let number = 42;
      print(message, number);
    `,
	},
	{
		title: "単純なnamed importの解決",
		modules: {
			main: `
        import { PI, multiply } from './utils.js';

        const radius = 5;
        const area = multiply(PI, radius * radius);
        print(area);
      `,
			utils: `
        export const PI = 3.14159;
        export function multiply(a: number, b: number): number {
          return a * b;
        }
      `,
		},
		expected: `
    let __gen_00001 = eval {
        let PI = 3.14159
        @multiply(a, b) {
          return (a * b)
        }
		({PI: PI, multiply: multiply})
    }
    let PI = __gen_00001.PI
    let multiply = __gen_00001.multiply
    let radius = 5
    let area = multiply(PI, (radius * radius))
    print(area)
    `,
	},
	{
		title: "変数名の衝突解決",
		modules: {
			main: `
        import { count as countA, increment } from './moduleA';
        import { count as countB, decrement } from './moduleB';

        const result = increment() + decrement();
        print(countA, countB, result);
      `,
			moduleA: `
        export const count = 1;
        export function increment() {
          return count + 1;
        }
      `,
			moduleB: `
        export const count = 100;
        export function decrement() {
          return count - 1;
        }
      `,
		},
		expected: `let __gen_00001 = eval {
      let count = 1
      @increment() {
        return (count + 1)
      }
      ({count: count, increment: increment})
    }
    let __gen_00002 = eval {
      let count = 100
      @decrement() {
        return (count - 1)
      }
      ({count: count, decrement: decrement})
    }
    let countA = __gen_00001.count
    let increment = __gen_00001.increment
    let countB = __gen_00002.count
    let decrement = __gen_00002.decrement
    let result = (increment() + decrement())
    print(countA, countB, result)`,
	},
	{
		title: "複数階層のimportチェーン",
		modules: {
			main: `
        import { MIDDLE_VALUE, getBase } from './middle';

        const result = MIDDLE_VALUE + getBase();
        console.log(result);
      `,
			middle: `
        import { BASE_VALUE } from './base';
        export const MIDDLE_VALUE = BASE_VALUE * 2;
        export function getBase() {
          return BASE_VALUE;
        }
      `,
			base: `
        export const BASE_VALUE = 10;
      `,
		},
		expected: `
    `,
	},
	{
		title: "関数のexportとimport",
		modules: {
			main: `
        import { add, subtract } from './math';

        const x = 10;
        const y = 5;
        const sum = add(x, y);
        const diff = subtract(x, y);

        console.log(sum, diff);
      `,
			math: `
        export function add(a: number, b: number): number {
          return a + b;
        }

        export function subtract(a: number, b: number): number {
          return a - b;
        }
      `,
		},
		expected: `
    `,
	},
];

const positionTestCases = [
	{
		title: "class at specific position",
		modules: {
			main: `// Comment line 1
// Comment line 2
class ErrorClass {
  field = 42;
}`,
		},
		expectedPosition: "entry.ts:3:1",
	},
	{
		title: "function with class inside",
		modules: {
			main: `// Comment line 1
function wrapper() {
  class IndentedClass {
    field = 42;
  }
}`,
		},
		expectedPosition: "entry.ts:3:3",
	},
	{
		title: "enum at specific position",
		modules: {
			main: `console.log("before enum");
enum TestEnum {
  A, B, C
}
console.log("after enum");`,
		},
		expectedPosition: "entry.ts:2:1",
	},
	{
		title: "try-catch with specific position",
		modules: {
			main: `const x = 1;
const y = 2;
try {
  console.log("in try");
} catch (e) {
  console.log("in catch");
}`,
		},
		expectedPosition: "entry.ts:3:1",
	},
	{
		title: "class with indentation",
		modules: {
			main: `const before = 1;
    class SpacedClass {
      prop = 42;
    }`,
		},
		expectedPosition: "entry.ts:2:5",
	},
	// Multi-module test cases
	{
		title: "error in imported module",
		modules: {
			main: `import { utility } from './utils';
console.log("main file");
const result = utility();`,
			utils: `// Utils file comment
export function utility() {
  class UtilityClass {
    field = 42;
  }
  return "test";
}`,
		},
		expectedPosition: "utils.ts:3:3",
	},
	{
		title: "error in deeply nested import chain",
		modules: {
			main: `import { midLevel } from './middle';
const value = midLevel();`,
			middle: `import { baseValue } from './base';
export function midLevel() {
  return baseValue + 10;
}`,
			base: `const x = 1;
const y = 2;
export enum BaseEnum {
  A, B, C
}
export const baseValue = 42;`,
		},
		expectedPosition: "base.ts:3:1",
	},
	{
		title: "export statement with unsupported syntax",
		modules: {
			main: `import { asyncFunc } from './async';
asyncFunc();`,
			async: `// Async module
export async function asyncFunc() {
  await Promise.resolve();
  return "done";
}`,
		},
		expectedPosition: "async.ts:3:3",
	},
	{
		title: "multiple errors - first error location",
		modules: {
			main: `import { first } from './errors';
first();`,
			errors: `export class FirstError {
  prop = 1;
}

export class SecondError {
  prop = 2;
}`,
		},
		expectedPosition: "errors.ts:1:1",
	},
	{
		title: "error within exported function",
		modules: {
			main: `import { complexFunc } from './complex';
complexFunc();`,
			complex: `const helper = 1;

export function complexFunc() {
  try {
    return "works";
  } catch (e) {
    return "error";
  }
}`,
		},
		expectedPosition: "complex.ts:4:3",
	},
];

function transpile(modules: { [key: string]: string }) {
	// 単一ファイル用のプログラムを作成
	const compilerOptions: ts.CompilerOptions = {
		nolib: true,
		types: ["aiscript.d.ts"],
	};

	const files = {
		...Object.fromEntries(
			Object.entries(modules).map(([k, v]) => [
				`${k}.ts`,
				ts.createSourceFile(`${k}.ts`, v, ts.ScriptTarget.Latest),
			]),
		),
		"aiscript.d.ts": ts.createSourceFile(
			"aiscript.d.ts",
			fs.readFileSync("./types/aiscript.d.ts", "utf8"),
			ts.ScriptTarget.Latest,
			true,
		),
	};

	const raws = {
		...Object.fromEntries(
			Object.entries(modules).map(([k, v]) => [`${k}.ts`, v]),
		),
		"aiscript.d.ts": fs.readFileSync("./types/aiscript.d.ts", "utf8"),
	};

	const program = ts.createProgram(Object.keys(files), compilerOptions, {
		getSourceFile: (fileName) => (files as any)[fileName],
		writeFile: () => {},
		getCurrentDirectory: () => process.cwd(),
		getDirectories: () => [],
		fileExists: (fileName) => fileName in files,
		readFile: (fileName) => raws[fileName],
		getCanonicalFileName: (fileName) => fileName,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => "\n",
		getDefaultLibFileName: () => "aiscript.d.ts",
	});

	return new TypeScriptToAiScriptTranspiler().transpileProgram(
		program,
		(files as any)["main.ts"],
	);
}

describe.only("AiScript Bundler", () => {
	test.each(testCases)("$title", ({ modules, expected }) => {
		// ファイルを作成
		const bundledResult = transpile(modules as any);

		// For now, just check that the result is a string and contains some expected content
		expect(AiScriptStringifier.stringify(bundledResult)).toBe(
			AiScriptStringifier.stringify(Parser.parse(expected)),
		);
	});
});
describe("Error position verification", () => {
	test.each(positionTestCases)("$title", ({ modules, expectedPosition }) => {
		expect(() => {
			transpile(modules as any);
		}).toThrow(TranspilerError);

		try {
			transpile(modules as any);
		} catch (error) {
			expect(error).toBeInstanceOf(TranspilerError);
			const transpilerError = error as TranspilerError;

			// expectedPosition をパース (例: "utils.ts:4:3")
			const parts = expectedPosition.split(":");
			const expectedFile = parts[0]!;
			const expectedLineNum = parseInt(parts[1]!, 10);
			const expectedColNum = parseInt(parts[2]!, 10);

			// ファイル名の検証 (フルパスから最後の部分を取得)
			const actualFileName = transpilerError.sourceFile.fileName
				.split("/")
				.pop()!;
			expect(actualFileName).toBe(expectedFile);

			// 行番号・列番号の検証
			const position = transpilerError.getPosition();
			expect(position.startLine).toBe(expectedLineNum);
			expect(position.startColumn).toBe(expectedColNum);

			// 結果表示
			const moduleCount = Object.keys(modules).length;
			const moduleType = moduleCount === 1 ? "Single-module" : "Multi-module";
			console.log(
				`✓ ${moduleType} position verified: ${actualFileName}:${position.startLine}:${position.startColumn} (expected: ${expectedPosition})`,
			);
		}
	});
});
