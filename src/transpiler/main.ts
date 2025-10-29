import { AiScriptStringifier } from "../stringifier.js"
import { Transpiler as BaseTranspiler } from "./base.js"
import { ExpressionStatementPlugin } from "./plugins/statements/expressionStatement.js"
import { LiteralPlugin } from "./plugins/expressions/literals.js"
import { ExpressionsPlugin } from "./plugins/expressions/expressions.js"
import { PropertyAccessPlugin } from "./plugins/expressions/property-access.js"
import { VariableStatementPlugin } from "./plugins/statements/variableStatement.js"
import { StatementsPlugin } from "./plugins/statements/statements.js"
import { FunctionsPlugin } from "./plugins/functions.js"
import { LoopStatementsPlugin } from "./plugins/statements/loop.js"
import { ForOfStatementPlugin } from "./plugins/statements/forOfStatement.js"
import type { Ast } from "@syuilo/aiscript"
import { BinaryExpressionPlugin } from "./plugins/expressions/binaryExpression.js"
import { TypeNodesPlugin } from "./plugins/typesNodes.js"
import { UnaryExpressionPlugin } from "./plugins/expressions/unaryExpression.js"
import { ConditionPlugin } from "./plugins/condition.js"
import { SwitchStatementPlugin } from "./plugins/statements/switchStatement.js"

export class TypeScriptToAiScriptTranspiler {
    #transpiler: BaseTranspiler
    constructor() {
        const transpiler = new BaseTranspiler()
        transpiler.addPlugin(LiteralPlugin)
        transpiler.addPlugin(BinaryExpressionPlugin)
        transpiler.addPlugin(UnaryExpressionPlugin)
        transpiler.addPlugin(ExpressionsPlugin)
        transpiler.addPlugin(PropertyAccessPlugin)
        transpiler.addPlugin(VariableStatementPlugin)
        transpiler.addPlugin(StatementsPlugin)
        transpiler.addPlugin(FunctionsPlugin)
        transpiler.addPlugin(LoopStatementsPlugin)
        transpiler.addPlugin(ConditionPlugin)
        transpiler.addPlugin(SwitchStatementPlugin)
        transpiler.addPlugin(ForOfStatementPlugin)
        transpiler.addPlugin(ExpressionStatementPlugin)
        transpiler.addPlugin(TypeNodesPlugin)
        this.#transpiler = transpiler
    }

    transpile(sourceCode: string): Ast.Node[] {
        return this.#transpiler.transpile(sourceCode)
    }

    transpileAndStringify(sourceCode: string): string {
        const result = this.transpile(sourceCode)
        return AiScriptStringifier.stringify(result)
    }

    static transpile(sourceCode: string): Ast.Node[] {
        const transpiler = new TypeScriptToAiScriptTranspiler()
        return transpiler.transpile(sourceCode)
    }
}