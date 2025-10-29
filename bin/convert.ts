import * as fs from "node:fs";
import * as path from "node:path";
import { AiScriptBundler } from "../src/bundler";
import { AiScriptStringifier } from "../src/stringifier";

// bundlerを使って正しくimportを解決
const bundler = new AiScriptBundler("../program/main.ts", "../program");
const res = AiScriptStringifier.stringify(bundler.bundle());

// 出力ファイルパス
const outputPath = "../program/output.ais";

// ディレクトリが存在することを確認
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir, { recursive: true });
}

// ファイルに書き込み
fs.writeFileSync(outputPath, res, "utf8");

console.log(`AiScriptコードを ${outputPath} に出力しました`);
console.log(`ファイルサイズ: ${res.length} 文字`);
