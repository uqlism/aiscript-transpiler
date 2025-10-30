import type { Ast } from "@syuilo/aiscript";
import ts from "typescript";
import { AiScriptStringifier } from "../stringifier.js";
import { Transpiler as BaseTranspiler } from "./base.js";
import { ConditionPlugin } from "./plugins/condition.js";
import { BinaryExpressionPlugin } from "./plugins/expressions/binaryExpression.js";
import { ExpressionsPlugin } from "./plugins/expressions/expressions.js";
import { LiteralPlugin } from "./plugins/expressions/literals.js";
import { PropertyAccessPlugin } from "./plugins/expressions/property-access.js";
import { UnaryExpressionPlugin } from "./plugins/expressions/unaryExpression.js";
import { FunctionsPlugin } from "./plugins/functions.js";
import { ExpressionStatementPlugin } from "./plugins/statements/expressionStatement.js";
import { ExportStatementPlugin } from "./plugins/statements/exportStatement.js";
import { ForOfStatementPlugin } from "./plugins/statements/forOfStatement.js";
import { ImportStatementPlugin } from "./plugins/statements/importStatement.js";
import { LoopStatementsPlugin } from "./plugins/statements/loop.js";
import { StatementsPlugin } from "./plugins/statements/statements.js";
import { SwitchStatementPlugin } from "./plugins/statements/switchStatement.js";
import { VariableStatementPlugin } from "./plugins/statements/variableStatement.js";
import { TypeNodesPlugin } from "./plugins/typesNodes.js";

export class TypeScriptToAiScriptTranspiler {
	#transpiler: BaseTranspiler;
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

	transpile(sourceCode: string, userProjectRoot?: string): Ast.Node[] {
		return this.#transpiler.transpile(sourceCode, userProjectRoot);
	}

	transpileFile(entryFilePath: string, userProjectRoot?: string): Ast.Node[] {
		return this.#transpiler.transpileFile(entryFilePath, userProjectRoot);
	}

	static transpile(sourceCode: string, userProjectRoot?: string): Ast.Node[] {
		const transpiler = new TypeScriptToAiScriptTranspiler();
		return transpiler.transpile(sourceCode, userProjectRoot);
	}

	static transpileFile(entryFilePath: string, userProjectRoot?: string): Ast.Node[] {
		const transpiler = new TypeScriptToAiScriptTranspiler();
		return transpiler.transpileFile(entryFilePath, userProjectRoot);
	}

	transpileAndStringify(sourceCode: string, userProjectRoot?: string): string {
		const result = this.transpile(sourceCode, userProjectRoot);
		return AiScriptStringifier.stringify(result);
	}

	transpileFileAndStringify(entryFilePath: string, userProjectRoot?: string): string {
		const result = this.transpileFile(entryFilePath, userProjectRoot);
		return AiScriptStringifier.stringify(result);
	}
}
