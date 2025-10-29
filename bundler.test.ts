import { describe, expect, test } from "bun:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { AiScriptBundler, BundlerError } from "./src/bundler";
import { TypeScriptToAiScriptTranspiler } from "./src/transpiler/main";

// テスト用のファイルシステム操作
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "test-files");

function ensureTestDir() {
	if (!fs.existsSync(testDir)) {
		fs.mkdirSync(testDir, { recursive: true });
	}
}

function createTestFile(fileName: string, content: string): string {
	ensureTestDir();
	const filePath = path.join(testDir, fileName);
	fs.writeFileSync(filePath, content, "utf8");
	return filePath;
}

function cleanupTestDir() {
	if (fs.existsSync(testDir)) {
		fs.rmSync(testDir, { recursive: true, force: true });
	}
}

const testCases = [
	{
		title: "単一ファイルの基本的な変換",
		modules: {
			main: `
        const message = "Hello, World!";
        const number = 42;
        console.log(message, number);
      `,
		},
		expected: `
      const message = "Hello, World!";
      const number = 42;
      console.log(message, number);
    `,
	},
	{
		title: "単純なnamed importの解決",
		modules: {
			main: `
        import { PI, multiply } from './utils';

        const radius = 5;
        const area = multiply(PI, radius * radius);
        console.log(area);
      `,
			utils: `
        export const PI = 3.14159;
        export function multiply(a: number, b: number): number {
          return a * b;
        }
      `,
		},
		expected: `
      const PI = 3.14159;
      function multiply(a: number, b: number): number {
        return a * b;
      }
      const radius = 5;
      const area = multiply(PI, radius * radius);
      console.log(area);
    `,
	},
	{
		title: "変数名の衝突解決",
		modules: {
			main: `
        import { count as countA, increment } from './moduleA';
        import { count as countB, decrement } from './moduleB';

        const result = increment() + decrement();
        console.log(countA, countB, result);
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
		expected: `
      const count = 1;
      function increment() {
        return count + 1;
      }
      const count$1 = 100;
      function decrement() {
        return count$1 - 1;
      }
      const result = increment() + decrement();
      console.log(countA, countB, result);
    `,
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
      const BASE_VALUE = 10;
      const MIDDLE_VALUE = BASE_VALUE * 2;
      function getBase() {
        return BASE_VALUE;
      }
      const result = MIDDLE_VALUE + getBase();
      console.log(result);
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
      function add(a: number, b: number): number {
        return a + b;
      }
      function subtract(a: number, b: number): number {
        return a - b;
      }
      const x = 10;
      const y = 5;
      const sum = add(x, y);
      const diff = subtract(x, y);
      console.log(sum, diff);
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
		expectedPosition: "entry.ts:5:1",
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
		expectedPosition: "entry.ts:4:3",
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
		expectedPosition: "entry.ts:2:1",
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
		expectedPosition: "utils.ts:4:3",
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
		expectedPosition: "async.ts:4:3",
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

describe("AiScript Bundler", () => {
	test.each(testCases)("$title", ({ modules, expected }) => {
		// ファイルを作成
		const createdFiles: string[] = [];
		for (const [fileName, content] of Object.entries(modules)) {
			const actualFileName =
				fileName === "main" ? "entry.ts" : `${fileName}.ts`;
			const filePath = createTestFile(actualFileName, content);
			createdFiles.push(filePath);
		}

		const entryFile = createdFiles[0]; // main は最初に作成される
		assert(entryFile);
		const bundler = new AiScriptBundler(entryFile, testDir);
		const bundledResult = bundler.bundle();

		// 期待するコードをTranspilerに通してASTを生成
		const transpiler = new TypeScriptToAiScriptTranspiler();
		const expectedAst = transpiler.transpile(expected);

		// バンドル結果と期待するASTを比較
		expect(bundledResult).toEqual(expectedAst);

		cleanupTestDir();
	});

	describe("Error position verification", () => {
		test.each(positionTestCases)("$title", ({ modules, expectedPosition }) => {
			// ファイルを作成
			const createdFiles: string[] = [];
			for (const [fileName, content] of Object.entries(modules)) {
				const actualFileName =
					fileName === "main" ? "entry.ts" : `${fileName}.ts`;
				const filePath = createTestFile(actualFileName, content);
				createdFiles.push(filePath);
			}

			const entryFile = createdFiles[0]; // main は最初に作成される
			assert(entryFile);
			const bundler = new AiScriptBundler(entryFile, testDir);

			expect(() => {
				bundler.bundle();
			}).toThrow(BundlerError);

			try {
				bundler.bundle();
			} catch (error) {
				expect(error).toBeInstanceOf(BundlerError);
				const bundlerError = error as BundlerError;

				// expectedPosition をパース (例: "utils.ts:4:3")
				const parts = expectedPosition.split(":");
				const expectedFile = parts[0]!;
				const expectedLineNum = parseInt(parts[1]!, 10);
				const expectedColNum = parseInt(parts[2]!, 10);

				// ファイル名の検証 (フルパスから最後の部分を取得)
				const actualFileName = bundlerError.sourceFile.split("/").pop()!;
				expect(actualFileName).toBe(expectedFile);

				// 行番号・列番号の検証
				expect(bundlerError.line).toBe(expectedLineNum);
				expect(bundlerError.column).toBe(expectedColNum);

				// 結果表示
				const moduleCount = Object.keys(modules).length;
				const moduleType = moduleCount === 1 ? "Single-module" : "Multi-module";
				console.log(
					`✓ ${moduleType} position verified: ${actualFileName}:${bundlerError.line}:${bundlerError.column} (expected: ${expectedPosition})`,
				);
			}

			cleanupTestDir();
		});
	});
});
