#!/usr/bin/env node

import { AiScriptStringifier } from "../src/stringifier";
import { AiScriptBundler } from "../src/bundler";
import * as fs from "fs";
import * as path from "path";
import { program } from "commander";
import { env } from "process";


program
  .command("transpile")
  .description("tsファイルをaisに変換")
  .showHelpAfterError()
  .argument("<entry-file>")
  .option("-o, --output <file>", "出力ファイルパス (デフォルト: dist/<name>.ais)")
  .action(transpile)

program
  .command("deploy")
  .description("tsファイルをaisに変換しplayを更新")
  .showHelpAfterError()
  .argument("<entry-file>")
  .argument("<domain>")
  .argument("<play-id>")
  .option("-c, --cred <token>", "APIアクセストークン (要: Playの編集権限) 環境変数 API_TOKEN に設定してもOK")
  .action(deploy)


function transpile(entryFile: string, options: { output: string }) {
  const outputFile = options.output

  // Resolve entry file path relative to current working directory
  const entryPath = path.resolve(process.cwd(), entryFile);

  // Check if entry file exists
  if (!fs.existsSync(entryPath)) {
    console.error(`❌ Error: File not found: ${entryFile}`);
    process.exit(1);
  }

  // Determine output path
  let finalOutputPath: string;
  if (outputFile) {
    finalOutputPath = path.resolve(process.cwd(), outputFile);
  } else {
    const baseName = path.basename(entryFile, path.extname(entryFile));
    const distDir = path.join(process.cwd(), 'dist');
    finalOutputPath = path.join(distDir, `${baseName}.ais`);
  }

  try {
    console.log(`🔧 Transpiling ${entryFile}...`);

    // Use bundler to transpile
    const bundler = new AiScriptBundler(entryPath, process.cwd());
    const result = bundler.bundle();
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

  } catch (error) {
    console.error('❌ Transpilation failed:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

async function deploy(entryFile: string, domain: string, playId: string, options: { cred: string }) {
  // Resolve entry file path relative to current working directory
  const entryPath = path.resolve(process.cwd(), entryFile);

  // Check if entry file exists
  if (!fs.existsSync(entryPath)) {
    console.error(`❌ Error: File not found: ${entryFile}`);
    process.exit(1);
  }

  const token = options.cred || env.API_TOKEN
  if (token === undefined) {
    console.error(`❌ Error: APIトークンを指定してください`);
    process.exit(1);
  }

  try {
    console.log(`🔧 変換中 ${entryFile}...`);

    // Use bundler to transpile
    const bundler = new AiScriptBundler(entryPath, process.cwd());
    const result = bundler.bundle();
    const aiScript = AiScriptStringifier.stringify(result);

    console.log(`🔧 Play更新中 ${entryFile}...`);
    await fetch(`https://${domain}/api/flash/update`, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        flashId: playId,
        script: aiScript
      })
    })

    aiScript
  } catch (error) {
    console.error('❌ Transpilation failed:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

await program.parseAsync()