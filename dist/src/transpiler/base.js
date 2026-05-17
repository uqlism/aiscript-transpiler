import * as path from "node:path";
import * as ts from "typescript";
import { reservedWords } from "./consts.js";
/** モジュールオブジェクトの変数名 */
const MODULES_VAR = "__modules";
const emptyLoc = { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } };
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
    #namespaces;
    constructor(namespaces = []) {
        this.#pluiginFactories = [];
        this.#namespaces = namespaces;
    }
    addPlugin(pluginFactory) {
        this.#pluiginFactories.push(pluginFactory);
    }
    /**
     * TypeScript Programを受け取ってAiScript ASTに変換する
     * 核となる変換処理のみを行う
     */
    transpileProgram(program, entrySourceFile, doTypeCheck = true) {
        const context = new TranspilerContextImpl(entrySourceFile, doTypeCheck, program, this.#namespaces);
        this.#pluiginFactories.forEach((x) => {
            context.addPlugin(x);
        });
        // Get modules sorted by dependency order (includes circular dependency check)
        const sortedModules = context.getSortedModules();
        const nonEntryModules = sortedModules.filter((m) => m.modulePath !== undefined);
        const result = [];
        // モジュールが存在する場合は __modules オブジェクトを宣言する
        if (nonEntryModules.length > 0) {
            result.push({
                type: "def",
                dest: { type: "identifier", name: MODULES_VAR, loc: emptyLoc },
                expr: { type: "obj", value: new Map(), loc: emptyLoc },
                mut: true, // var (mutable) — 後でインデックス代入するため
                attr: [],
                loc: emptyLoc,
            });
        }
        // Process modules in dependency order (dependencies first)
        for (const { source, modulePath } of sortedModules) {
            if (!modulePath)
                continue; // エントリファイルはスキップ
            // Create eval block for this module
            const moduleStatements = [];
            ts.forEachChild(source, (node) => {
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
            const exportVars = context.popExports();
            // If there are exports, add an export object at the end
            if (exportVars.size > 0) {
                const exportObj = {
                    type: "obj",
                    value: new Map(),
                    loc: emptyLoc,
                };
                for (const exportName of exportVars) {
                    exportObj.value.set(exportName, {
                        type: "identifier",
                        name: exportName,
                        loc: emptyLoc,
                    });
                }
                moduleStatements.push(exportObj);
            }
            // __modules["relative/path"] = eval { ... }
            if (moduleStatements.length > 0) {
                result.push({
                    type: "assign",
                    dest: {
                        type: "index",
                        target: { type: "identifier", name: MODULES_VAR, loc: emptyLoc },
                        index: { type: "str", value: modulePath, loc: emptyLoc },
                        loc: emptyLoc,
                    },
                    expr: { type: "block", statements: moduleStatements, loc: emptyLoc },
                    loc: emptyLoc,
                });
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
class TranspilerContextImpl {
    #plugins;
    #entrySourceFile;
    #uniqueIdCounter = 0;
    #program;
    #exportVars;
    #sortedModules;
    #namespaces;
    constructor(entrySourceFile, doTypeCheck, program, namespaces) {
        this.#entrySourceFile = entrySourceFile;
        this.#program = program;
        this.#plugins = [];
        this.typeChecker = program.getTypeChecker();
        this.doTypeCheck = doTypeCheck;
        this.#uniqueIdCounter = 0;
        this.#exportVars = new Set();
        this.#namespaces = namespaces;
        // Build sorted modules with dependency order and circular dependency check
        this.#sortedModules = this.buildSortedModules();
    }
    addPlugin(pluginFactory) {
        this.#plugins.push(new pluginFactory(this));
    }
    convertExpressionAsExpression(expr) {
        for (const plugin of this.#plugins) {
            const result = plugin.tryConvertExpressionAsExpression?.(expr);
            if (result !== undefined) {
                return result;
            }
        }
        throw new TranspilerError("Expression not supported", expr, this.#entrySourceFile);
    }
    convertExpressionAsStatements(expr) {
        for (const plugin of this.#plugins) {
            const result = plugin.tryConvertExpressionAsStatements?.(expr);
            if (result !== undefined) {
                return result;
            }
        }
        return [this.convertExpressionAsExpression(expr)];
    }
    convertStatementAsStatements(node) {
        for (const plugin of this.#plugins) {
            const result = plugin.tryConvertStatementAsStatements?.(node);
            if (result !== undefined) {
                return result;
            }
        }
        throw new TranspilerError(`Statement not supported ${node.getText()}`, node, this.#entrySourceFile);
    }
    getUniqueIdentifier() {
        this.#uniqueIdCounter++;
        const idStr = this.#uniqueIdCounter.toString(36).padStart(5, "0");
        const name = `__${idStr}`;
        return {
            type: "identifier",
            name,
            loc: { start: { column: 0, line: 0 }, end: { column: 0, line: 0 } },
        };
    }
    validateVariableName(name, node) {
        if (reservedWords.includes(name)) {
            this.throwError("予約語を変数名にすることはできません", node);
        }
        if (name.startsWith("__")) {
            this.throwError("__から始まる変数名は使用できません", node);
        }
    }
    throwError(message, node) {
        throw new TranspilerError(message, node, node.getSourceFile());
    }
    typeChecker;
    doTypeCheck;
    getModuleRef(importPath) {
        // TypeScriptのコンパイラAPIを使用してモジュール解決
        const resolution = ts.resolveModuleName(importPath, this.#entrySourceFile.fileName, this.#program.getCompilerOptions(), ts.sys);
        const findModule = (fileName) => this.#sortedModules.find((m) => m.fileName === fileName);
        let mod = resolution.resolvedModule?.resolvedFileName
            ? findModule(resolution.resolvedModule.resolvedFileName)
            : undefined;
        if (!mod && "failedLookupLocations" in resolution) {
            for (const loc of resolution.failedLookupLocations) {
                mod = findModule(loc);
                if (mod)
                    break;
            }
        }
        if (!mod?.modulePath) {
            throw new Error(`Module not found for import path: ${importPath}`);
        }
        // __modules["relative/path"] というインデックスアクセス式を返す
        return {
            type: "index",
            target: { type: "identifier", name: MODULES_VAR, loc: emptyLoc },
            index: { type: "str", value: mod.modulePath, loc: emptyLoc },
            loc: emptyLoc,
        };
    }
    getNamespaces() {
        return this.#namespaces;
    }
    addExport(name) {
        this.#exportVars.add(name);
    }
    popExports() {
        const result = this.#exportVars;
        this.#exportVars = new Set();
        return result;
    }
    /** エントリファイル以外のモジュールを返す */
    *getImportedModules() {
        for (const module of this.#sortedModules) {
            if (module.modulePath !== undefined) {
                yield { source: module.source, modulePath: module.modulePath };
            }
        }
    }
    /**
     * 依存関係を解析し、循環参照をチェックしつつ、依存関係順にソートされたモジュールリストを構築する
     * 子モジュールから親モジュール順 (subSubModule, subModule, entryModule)
     */
    buildSortedModules() {
        const dependencyGraph = new Map();
        const sourceFiles = this.#program.getSourceFiles().filter((sourceFile) => {
            if (sourceFile.fileName.includes("node_modules") ||
                sourceFile.fileName.includes("lib.") ||
                sourceFile.isDeclarationFile // .d.ts は型定義のみで実行コードなし
            ) {
                return false;
            }
            return true;
        });
        const allFiles = new Set(sourceFiles.map((x) => x.fileName));
        // build dependency graph
        for (const sourceFile of sourceFiles) {
            const dependencies = new Set();
            ts.forEachChild(sourceFile, (node) => {
                if (ts.isImportDeclaration(node) &&
                    node.moduleSpecifier &&
                    ts.isStringLiteral(node.moduleSpecifier)) {
                    const importPath = node.moduleSpecifier.text;
                    // Resolve the import path
                    const resolution = ts.resolveModuleName(importPath, sourceFile.fileName, this.#program.getCompilerOptions(), ts.sys);
                    if (resolution.resolvedModule?.resolvedFileName) {
                        dependencies.add(resolution.resolvedModule.resolvedFileName);
                    }
                    else if ("failedLookupLocations" in resolution) {
                        // Try failed lookup locations for test environment
                        for (const lookupPath of resolution.failedLookupLocations) {
                            if (allFiles.has(lookupPath)) {
                                dependencies.add(lookupPath);
                                break;
                            }
                        }
                    }
                    else {
                        throw new Error(`Module not found: ${importPath} from ${sourceFile.fileName}`);
                    }
                }
            });
            dependencyGraph.set(sourceFile.fileName, dependencies);
        }
        // Topological sort with cycle detection
        const visited = new Set();
        const recursionStack = new Set();
        const sortedFiles = [];
        const dfs = (fileName, path = []) => {
            if (recursionStack.has(fileName)) {
                // Found circular dependency
                const cycleStart = path.indexOf(fileName);
                const cycle = path.slice(cycleStart).concat([fileName]);
                throw new Error(`循環参照が検出されました: ${cycle.join(" -> ")}`);
            }
            if (visited.has(fileName)) {
                return;
            }
            visited.add(fileName);
            recursionStack.add(fileName);
            const dependencies = dependencyGraph.get(fileName);
            if (!dependencies) {
                throw new Error(`File not found in dependency graph: ${fileName}`);
            }
            for (const dependency of dependencies) {
                dfs(dependency, [...path, fileName]);
            }
            recursionStack.delete(fileName);
            sortedFiles.push(fileName);
        };
        // Sort all files
        for (const fileName of allFiles) {
            if (!visited.has(fileName)) {
                dfs(fileName);
            }
        }
        // エントリファイルのディレクトリ（モジュールの相対パス計算に使用）
        const entryDir = path.dirname(this.#entrySourceFile.fileName);
        const result = [];
        for (const fileName of sortedFiles) {
            const sourceFile = this.#program.getSourceFile(fileName);
            if (!sourceFile) {
                throw new Error(`Source file not found: ${fileName}`);
            }
            // エントリ以外のモジュールは相対パス（拡張子なし）をキーとして使う
            const modulePath = sourceFile !== this.#entrySourceFile
                ? path.relative(entryDir, fileName).replace(/\.tsx?$/, "")
                : undefined;
            result.push({ source: sourceFile, fileName, modulePath });
        }
        return result;
    }
    getSortedModules() {
        return this.#sortedModules;
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