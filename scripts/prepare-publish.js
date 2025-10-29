#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

// Make CLI executable
const cliPath = path.join("dist", "bin", "cli.js");
if (fs.existsSync(cliPath)) {
	fs.chmodSync(cliPath, "755");
	console.log("✅ Made CLI executable");
}

// Check if type definition files are present in types directory
const typesExist =
	fs.existsSync(path.join("types", "aiscript.d.ts")) &&
	fs.existsSync(path.join("types", "misskey_aiscript.d.ts"));

if (typesExist) {
	console.log("✅ Type definition files are included");
} else {
	console.log("⚠️  Type definition files not found in dist/");
}

console.log("📦 Package is ready for publication!");
console.log("");
console.log("Available exports:");
console.log(
	'- Main: import { TypeScriptToAiScriptTranspiler } from "aiscript-transpiler"',
);
console.log(
	'- Bundler: import { AiScriptBundler } from "aiscript-transpiler/bundler"',
);
console.log(
	'- Stringifier: import { AiScriptStringifier } from "aiscript-transpiler/stringifier"',
);
console.log('- AiScript types: import "aiscript-transpiler/types/aiscript"');
console.log('- Misskey types: import "aiscript-transpiler/types/misskey"');
console.log("");
console.log("Next steps:");
console.log("1. Update author field in package.json");
console.log("2. Update repository URLs in package.json");
console.log("3. Run: npm publish");
