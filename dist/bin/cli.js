#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "node:process";
import { program } from "commander";
import { AiScriptStringifier } from "../src/stringifier.js";
import { TranspilerError } from "../src/transpiler/base.js";
import { TypeScriptToAiScriptTranspiler } from "../src/transpiler/main.js";
program
    .command("transpile")
    .description("tsファイルをaisに変換")
    .showHelpAfterError()
    .argument("<entry-file>")
    .option("-o, --output <file>", "出力ファイルパス (デフォルト: dist/<name>.ais)")
    .option("--no-type-check", "型チェックをスキップ")
    .action(transpile);
program
    .command("deploy")
    .description("tsファイルをaisに変換しplayを更新")
    .showHelpAfterError()
    .argument("<entry-file>")
    .argument("<domain>")
    .argument("<play-id>")
    .option("-c, --cred <token>", "APIアクセストークン (要: Playの編集権限) 環境変数 API_TOKEN に設定してもOK")
    .option("--no-type-check", "型チェックをスキップ")
    .action(deploy);
function transpile(entryFile, options) {
    const outputFile = options.output;
    // Resolve entry file path relative to current working directory
    const entryPath = path.resolve(process.cwd(), entryFile);
    // Check if entry file exists
    if (!fs.existsSync(entryPath)) {
        console.error(`❌ Error: File not found: ${entryFile}`);
        process.exit(1);
    }
    // Determine output path
    let finalOutputPath;
    if (outputFile) {
        finalOutputPath = path.resolve(process.cwd(), outputFile);
    }
    else {
        const baseName = path.basename(entryFile, path.extname(entryFile));
        const distDir = path.join(process.cwd(), "dist");
        finalOutputPath = path.join(distDir, `${baseName}.ais`);
    }
    try {
        console.log(`🔧 Transpiling ${entryFile}...`);
        // Use transpiler directly with file path
        const transpiler = new TypeScriptToAiScriptTranspiler();
        const result = transpiler.transpileFile(entryPath, process.cwd(), !options.noTypeCheck);
        const aiScript = AiScriptStringifier.stringify(result);
        // Ensure output directory exists
        const outputDir = path.dirname(finalOutputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        // Write to file
        fs.writeFileSync(finalOutputPath, aiScript, "utf8");
        const relativePath = path.relative(process.cwd(), finalOutputPath);
        console.log(`✅ Successfully transpiled to ${relativePath}`);
        console.log(`📊 Output size: ${aiScript.length} characters`);
    }
    catch (error) {
        console.error("❌ Transpilation failed:");
        printError(error);
        process.exit(1);
    }
}
async function deploy(entryFile, domain, playId, options) {
    // Resolve entry file path relative to current working directory
    const entryPath = path.resolve(process.cwd(), entryFile);
    // Check if entry file exists
    if (!fs.existsSync(entryPath)) {
        console.error(`❌ Error: File not found: ${entryFile}`);
        process.exit(1);
    }
    const token = options.cred || env.API_TOKEN;
    if (token === undefined) {
        console.error(`❌ Error: APIトークンを指定してください`);
        process.exit(1);
    }
    try {
        console.log(`🔧 変換中 ${entryFile}...`);
        // Use transpiler directly with file path
        const transpiler = new TypeScriptToAiScriptTranspiler();
        const result = transpiler.transpileFile(entryPath, process.cwd(), !options.noTypeCheck);
        const aiScript = AiScriptStringifier.stringify(result);
        console.log(`🔧 Play更新中 ${entryFile}...`);
        const res = await fetch(`https://${domain}/api/flash/update`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                flashId: playId,
                script: aiScript,
            }),
        });
        if (!res.ok) {
            console.log(await res.json());
        }
    }
    catch (error) {
        console.error("❌ Transpilation failed:");
        printError(error);
        process.exit(1);
    }
}
function formatTranspilerError(error) {
    const pos = error.getPosition();
    const file = error.sourceFile.fileName;
    const lines = error.sourceFile.text.split("\n");
    const lineIndex = pos.startLine - 1;
    const digits = String(pos.startLine + 1).length;
    const pad = (n) => String(n).padStart(digits);
    const context = [];
    if (lineIndex > 0)
        context.push(`  ${pad(pos.startLine - 1)} | ${lines[lineIndex - 1]}`);
    context.push(`> ${pad(pos.startLine)} | ${lines[lineIndex]}`);
    const indent = " ".repeat(pos.startColumn - 1);
    const caret = "^".repeat(Math.max(1, pos.endColumn - pos.startColumn));
    context.push(`  ${" ".repeat(digits)} | ${indent}${caret}`);
    if (lineIndex + 1 < lines.length)
        context.push(`  ${pad(pos.startLine + 1)} | ${lines[lineIndex + 1]}`);
    return `${file}:${pos.startLine}:${pos.startColumn}: ${error.message}\n${context.join("\n")}`;
}
function printError(error) {
    if (error instanceof TranspilerError) {
        console.error(formatTranspilerError(error));
    }
    else if (error instanceof Error) {
        console.error(error.message);
    }
    else {
        console.error(String(error));
    }
}
await program.parseAsync();
//# sourceMappingURL=cli.js.map