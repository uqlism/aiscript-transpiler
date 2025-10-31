import * as ts from "typescript";
import { reservedWords } from "./consts.js";
/**
 * TypeScript位置情報付きトランスパイラーエラー
 */
export class TranspilerError extends Error {
    node;
    sourceFile;
    constructor(message, node, sourceFile) {
        super(message);
        this.node = node;
        this.sourceFile = sourceFile;
        this.name = "TranspilerError";
    }
    getPosition() {
        const start = this.sourceFile.getLineAndCharacterOfPosition(this.node.getStart());
        const end = this.sourceFile.getLineAndCharacterOfPosition(this.node.getEnd());
        return {
            startLine: start.line + 1,
            startColumn: start.character + 1,
            endLine: end.line + 1,
            endColumn: end.character + 1,
        };
    }
}
export class Transpiler {
    #pluiginFactories;
    constructor() {
        this.#pluiginFactories = [];
    }
    addPlugin(pluginFactory) {
        this.#pluiginFactories.push(pluginFactory);
    }
    /**
     * TypeScript Programを受け取ってAiScript ASTに変換する
     * 核となる変換処理のみを行う
     */
    transpileProgram(program, entrySourceFile) {
        /**
         * グローバルなユニークID生成器
         */
        let uniqueIdCounter = 0;
        const getUniqueIdentifier = () => {
            uniqueIdCounter++;
            const idStr = uniqueIdCounter.toString(36).padStart(5, "0");
            const name = `__gen_${idStr}`;
            return {
                type: "identifier",
                name,
                loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
            };
        };
        const typeChecker = program.getTypeChecker();
        const plugins = [];
        // プログラムからすべてのソースファイルを取得し、エントリファイル以外をモジュールとして扱う
        const modulePathToId = new Map();
        const allSourceFiles = program.getSourceFiles();
        for (const sourceFile of allSourceFiles) {
            // TypeScript組み込みライブラリファイルをスキップ
            if (sourceFile.fileName.includes("node_modules") ||
                sourceFile.fileName.includes("lib.")) {
                continue;
            }
            // エントリファイル以外をモジュールとして登録
            if (sourceFile.fileName !== entrySourceFile.fileName) {
                const moduleId = getUniqueIdentifier();
                modulePathToId.set(sourceFile.fileName, moduleId);
            }
        }
        const context = {
            convertExpressionAsExpression: (node) => {
                for (const plugin of plugins) {
                    const result = plugin.tryConvertExpressionAsExpression?.(node);
                    if (result !== undefined) {
                        return result;
                    }
                }
                throw new TranspilerError("Expression not supported", node, entrySourceFile);
            },
            convertExpressionAsStatements: (node) => {
                for (const plugin of plugins) {
                    const result = plugin.tryConvertExpressionAsStatements?.(node);
                    if (result !== undefined) {
                        return result;
                    }
                }
                return [context.convertExpressionAsExpression(node)];
            },
            convertStatementAsStatements: (node) => {
                for (const plugin of plugins) {
                    const result = plugin.tryConvertStatementAsStatements?.(node);
                    if (result !== undefined) {
                        return result;
                    }
                }
                throw new TranspilerError(`Statement not supported ${node.getText()}`, node, entrySourceFile);
            },
            typeChecker: typeChecker,
            getUniqueIdentifier,
            getModuleRef: (importPath) => {
                // TypeScriptのコンパイラAPIを使用してモジュール解決
                const resolution = ts.resolveModuleName(importPath, entrySourceFile.fileName, program.getCompilerOptions(), ts.sys);
                if (resolution.resolvedModule?.resolvedFileName) {
                    const resolvedPath = resolution.resolvedModule.resolvedFileName;
                    const moduleId = modulePathToId.get(resolvedPath);
                    if (moduleId)
                        return moduleId;
                }
                if ("failedLookupLocations" in resolution) {
                    for (const i of resolution.failedLookupLocations) {
                        const moduleId = modulePathToId.get(i);
                        if (moduleId)
                            return moduleId;
                    }
                }
                throw new Error(`Module not found for import path: ${importPath}`);
            },
            addExport: (_name) => {
                throw new Error("");
            },
            throwError: (message, node) => {
                throw new TranspilerError(message, node, node.getSourceFile());
            },
            validateVariableName: (name, node) => {
                if (reservedWords.includes(name)) {
                    throw new TranspilerError("予約語を変数名にすることはできません", node, node.getSourceFile());
                }
            },
        };
        plugins.push(...this.#pluiginFactories.map((x) => new x(context)));
        const result = [];
        // Process all imported modules first
        for (const [modulePath, moduleId] of modulePathToId) {
            const exportVars = new Set();
            context.addExport = (name) => {
                exportVars.add(name);
            };
            const moduleSourceFile = program.getSourceFile(modulePath);
            if (!moduleSourceFile) {
                throw new Error(`Module source file not found: ${modulePath}`);
            }
            // Create eval block for this module
            const moduleStatements = [];
            ts.forEachChild(moduleSourceFile, (node) => {
                switch (true) {
                    case node.kind === ts.SyntaxKind.EndOfFileToken:
                        return;
                    case ts.isStatement(node):
                        moduleStatements.push(...context.convertStatementAsStatements(node));
                        return;
                    default:
                        throw new Error("unknown node");
                }
            });
            // If there are exports, add an export object at the end
            if (exportVars.size > 0) {
                const exportObj = {
                    type: "obj",
                    value: new Map(),
                    loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
                };
                for (const exportName of exportVars) {
                    exportObj.value.set(exportName, {
                        type: "identifier",
                        name: exportName,
                        loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
                    });
                }
                moduleStatements.push(exportObj);
            }
            // Add the module as an eval block
            if (moduleStatements.length > 0) {
                const moduleBlock = {
                    type: "block",
                    statements: moduleStatements,
                    loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
                };
                // Assign the module result to the module identifier
                const moduleAssignment = {
                    type: "def",
                    dest: moduleId,
                    expr: moduleBlock,
                    mut: false,
                    attr: [],
                    loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
                };
                result.push(moduleAssignment);
            }
        }
        // Process the entry file
        ts.forEachChild(entrySourceFile, (node) => {
            switch (true) {
                case node.kind === ts.SyntaxKind.EndOfFileToken:
                    return;
                case ts.isExpression(node):
                    result.push(...context.convertExpressionAsStatements(node));
                    return;
                case ts.isStatement(node):
                    result.push(...context.convertStatementAsStatements(node));
                    return;
                default:
                    throw new Error("unknown node");
            }
        });
        return result;
    }
}
export class TranspilerPlugin {
    converter;
    constructor(converter) {
        this.converter = converter;
    }
    tryConvertExpressionAsExpression;
    tryConvertExpressionAsStatements;
    tryConvertStatementAsStatements;
}
//# sourceMappingURL=base.js.map