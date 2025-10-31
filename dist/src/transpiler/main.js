import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { Transpiler as BaseTranspiler } from "./base.js";
import { ConditionPlugin } from "./plugins/condition.js";
import { BinaryExpressionPlugin } from "./plugins/expressions/binaryExpression.js";
import { ExpressionsPlugin } from "./plugins/expressions/expressions.js";
import { LiteralPlugin } from "./plugins/expressions/literals.js";
import { PropertyAccessPlugin } from "./plugins/expressions/property-access.js";
import { UnaryExpressionPlugin } from "./plugins/expressions/unaryExpression.js";
import { FunctionsPlugin } from "./plugins/functions.js";
import { ExportStatementPlugin } from "./plugins/statements/exportStatement.js";
import { ExpressionStatementPlugin } from "./plugins/statements/expressionStatement.js";
import { ForOfStatementPlugin } from "./plugins/statements/forOfStatement.js";
import { ImportStatementPlugin } from "./plugins/statements/importStatement.js";
import { LoopStatementsPlugin } from "./plugins/statements/loop.js";
import { StatementsPlugin } from "./plugins/statements/statements.js";
import { SwitchStatementPlugin } from "./plugins/statements/switchStatement.js";
import { VariableStatementPlugin } from "./plugins/statements/variableStatement.js";
import { TypeNodesPlugin } from "./plugins/typesNodes.js";
/**
 * tsconfig.jsonからCompilerOptionsを読み込む
 */
function loadCompilerOptions(userProjectRoot) {
    let baseCompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        allowJs: false,
        declaration: false,
        outDir: undefined,
        rootDir: undefined,
        removeComments: false,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        noLib: true,
    };
    try {
        // ユーザープロジェクトのtsconfig.jsonを読み込み
        const tsconfigPath = path.join(userProjectRoot, "tsconfig.json");
        if (fs.existsSync(tsconfigPath)) {
            const tsconfigContent = fs.readFileSync(tsconfigPath, "utf8");
            // JSONコメントを削除してからパース
            const cleanedContent = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
            const tsconfigJson = JSON.parse(cleanedContent);
            // TypeScriptの公式APIを使用して安全にcompilerOptionsを変換
            if (tsconfigJson.compilerOptions) {
                const { options, errors } = ts.convertCompilerOptionsFromJson(tsconfigJson.compilerOptions, userProjectRoot);
                if (errors.length > 0) {
                    console.warn("TypeScript compiler options conversion errors:", errors.map((e) => e.messageText));
                }
                // ベースオプションとユーザーオプションをマージ
                baseCompilerOptions = {
                    ...baseCompilerOptions,
                    ...options,
                    noLib: true, // 常にnoLib: trueにして制御下に置く
                };
            }
        }
    }
    catch (error) {
        console.warn("Failed to read tsconfig.json:", error);
    }
    return baseCompilerOptions;
}
export class TypeScriptToAiScriptTranspiler {
    #transpiler;
    constructor() {
        const transpiler = new BaseTranspiler();
        // Import/Export plugins must come first to handle import/export modifiers
        transpiler.addPlugin(ImportStatementPlugin);
        transpiler.addPlugin(ExportStatementPlugin);
        transpiler.addPlugin(LiteralPlugin);
        transpiler.addPlugin(BinaryExpressionPlugin);
        transpiler.addPlugin(UnaryExpressionPlugin);
        transpiler.addPlugin(ExpressionsPlugin);
        transpiler.addPlugin(PropertyAccessPlugin);
        transpiler.addPlugin(VariableStatementPlugin);
        transpiler.addPlugin(StatementsPlugin);
        transpiler.addPlugin(FunctionsPlugin);
        transpiler.addPlugin(LoopStatementsPlugin);
        transpiler.addPlugin(ConditionPlugin);
        transpiler.addPlugin(SwitchStatementPlugin);
        transpiler.addPlugin(ForOfStatementPlugin);
        transpiler.addPlugin(ExpressionStatementPlugin);
        transpiler.addPlugin(TypeNodesPlugin);
        this.#transpiler = transpiler;
    }
    transpileFile(entryFilePath, userProjectRoot) {
        const projectRoot = userProjectRoot || path.dirname(entryFilePath);
        const compilerOptions = loadCompilerOptions(projectRoot);
        const program = ts.createProgram([entryFilePath], compilerOptions);
        const entrySourceFile = program.getSourceFile(entryFilePath);
        if (!entrySourceFile) {
            throw new Error(`Entry file not found: ${entryFilePath}`);
        }
        return this.#transpiler.transpileProgram(program, entrySourceFile);
    }
    transpileProgram(program, entrySourceFile) {
        return this.#transpiler.transpileProgram(program, entrySourceFile);
    }
}
//# sourceMappingURL=main.js.map