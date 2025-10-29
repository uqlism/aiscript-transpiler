import { Ast } from "@syuilo/aiscript";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { reservedWords } from "./consts.js";

/**
 * TypeScript位置情報付きトランスパイラーエラー
 */
export class TranspilerError extends Error {
  constructor(
    message: string,
    public node: ts.Node,
    public sourceFile: ts.SourceFile
  ) {
    super(message);
    this.name = 'TranspilerError';
  }

  getPosition() {
    const start = this.sourceFile.getLineAndCharacterOfPosition(this.node.getStart());
    const end = this.sourceFile.getLineAndCharacterOfPosition(this.node.getEnd());
    return {
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1
    };
  }
}

export class Transpiler {
    #pluiginFactories: (new (converter: TranspilerContext) => TranspilerPlugin)[];

    constructor() {
        this.#pluiginFactories = []
    }
    addPlugin(pluginFactory: new (converter: TranspilerContext) => TranspilerPlugin) {
        this.#pluiginFactories.push(pluginFactory)
    }
    transpile(sourceCode: string) {
        const sourceFile = ts.createSourceFile("main.ts", sourceCode, ts.ScriptTarget.Latest, true);

        // 型チェック用のプログラムを作成
        const program = ts.createProgram(["main.ts"], {}, {
            getSourceFile: (fileName) => {
                if (fileName === "main.ts") {
                    return sourceFile;
                }
                if (fileName === "aiscript.d.ts") {
                    // aiscript.d.tsの内容を読み込み
                    try {
                        const __dirname = path.dirname(fileURLToPath(import.meta.url));
                        const aiscriptDtsPath = path.join(__dirname, '../aiscript.d.ts');
                        const aiscriptDtsContent = fs.readFileSync(aiscriptDtsPath, 'utf8');
                        return ts.createSourceFile("aiscript.d.ts", aiscriptDtsContent, ts.ScriptTarget.Latest, true);
                    } catch (e) {
                        console.warn('aiscript.d.ts not found, fallback to basic type checking');
                        return undefined;
                    }
                }
                return undefined;
            },
            writeFile: () => { },
            getCurrentDirectory: () => "",
            getDirectories: () => [],
            fileExists: (fileName) => fileName === "main.ts" || fileName === "aiscript.d.ts",
            readFile: () => "",
            getCanonicalFileName: (fileName) => fileName,
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => "\n",
            getDefaultLibFileName: () => "aiscript.d.ts"
        });
        const typeChecker = program.getTypeChecker();

        const plugins: TranspilerPlugin[] = []
        let uniqueIdCounter = 0;
        const context = {
            convertExpressionAsExpression(expr: ts.Expression): Ast.Expression {
                for (const plugin of plugins) {
                    const result = plugin.tryConvertExpressionAsExpression?.(expr)
                    if (result) return result
                }
                throw new TranspilerError(`No plugin found for expression: ${ts.SyntaxKind[expr.kind]}`, expr, sourceFile)
            },
            convertExpressionAsStatements(expr: ts.Expression): (Ast.Expression | Ast.Statement)[] {
                for (const plugin of plugins) {
                    const result1 = plugin.tryConvertExpressionAsStatements?.(expr)
                    if (result1) return result1
                    const result2 = plugin.tryConvertExpressionAsExpression?.(expr)
                    if (result2) return [result2]
                }
                throw new TranspilerError(`No plugin found for expression as statements: ${ts.SyntaxKind[expr.kind]}`, expr, sourceFile)
            },
            convertStatementAsStatements(expr: ts.Statement): (Ast.Expression | Ast.Statement)[] {
                for (const plugin of plugins) {
                    const result = plugin.tryConvertStatementAsStatements?.(expr)
                    if (result) return result
                }
                throw new TranspilerError(`No plugin found for statement: ${ts.SyntaxKind[expr.kind]}`, expr, sourceFile)
            },
            getUniqueIdentifier: (): Ast.Identifier => {
                uniqueIdCounter++;
                const idStr = uniqueIdCounter.toString(36).padStart(5, '0');
                const name = `_temp_${idStr}`;
                return {
                    type: "identifier",
                    name,
                    loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } }
                };
            },
            validateVariableName: (name: string, node: ts.Node): void => {
                if (reservedWords.includes(name)) {
                    throw new TranspilerError('予約語を変数名にすることはできません', node, sourceFile);
                }
            },
            throwError: (message: string, node: ts.Node): never => {
                throw new TranspilerError(message, node, sourceFile);
            },
            typeChecker

        }
        plugins.push(...this.#pluiginFactories.map(x => new x(context)))

        const result: Ast.Node[] = [];
        ts.forEachChild(sourceFile, (node) => {
            switch (true) {
                case node.kind === ts.SyntaxKind.EndOfFileToken:
                    return;
                case ts.isExpression(node):
                    result.push(...context.convertExpressionAsStatements(node));
                    return
                case ts.isStatement(node):
                    result.push(...context.convertStatementAsStatements(node));
                    return
                default:
                    throw new Error("unknown node")
            }
        });
        return result;
    }
}

export type TranspilerContext = {
    convertExpressionAsExpression(expr: ts.Expression): Ast.Expression
    convertExpressionAsStatements(expr: ts.Expression): (Ast.Expression | Ast.Statement)[]
    convertStatementAsStatements(expr: ts.Statement): (Ast.Expression | Ast.Statement)[]
    getUniqueIdentifier(): Ast.Identifier
    validateVariableName(name: string, node: ts.Node): void
    throwError(message: string, node: ts.Node): never
    typeChecker: ts.TypeChecker
}

export class TranspilerPlugin {
    protected converter: TranspilerContext
    constructor(converter: TranspilerContext) {
        this.converter = converter
    }
    tryConvertExpressionAsExpression?: (node: ts.Expression) => Ast.Expression | undefined
    tryConvertExpressionAsStatements?: (node: ts.Expression) => (Ast.Expression | Ast.Statement)[] | undefined
    tryConvertStatementAsStatements?: (node: ts.Statement) => (Ast.Expression | Ast.Statement)[] | undefined
}