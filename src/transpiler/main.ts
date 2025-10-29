import { AiScriptStringifier } from "../stringifier"
import { Transpiler as BaseTranspiler } from "./base"
import { ExpressionStatementPlugin } from "./plugins/statements/expressionStatement"
import { LiteralPlugin } from "./plugins/expressions/literals"
import { ExpressionsPlugin } from "./plugins/expressions/expressions"
import { PropertyAccessPlugin } from "./plugins/expressions/property-access"
import { VariableStatementPlugin } from "./plugins/statements/variableStatement"
import { StatementsPlugin } from "./plugins/statements/statements"
import { FunctionsPlugin } from "./plugins/functions"
import { LoopStatementsPlugin } from "./plugins/statements/loop"
import { ForOfStatementPlugin } from "./plugins/statements/forOfStatement"
import type { Ast } from "@syuilo/aiscript"
import { BinaryExpressionPlugin } from "./plugins/expressions/binaryExpression"
import { TypeNodesPlugin } from "./plugins/typesNodes"
import { UnaryExpressionPlugin } from "./plugins/expressions/unaryExpression"
import { ConditionPlugin } from "./plugins/condition"
import { SwitchStatementPlugin } from "./plugins/statements/switchStatement"

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