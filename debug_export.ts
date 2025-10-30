import { TypeScriptToAiScriptTranspiler } from './src/transpiler/main.js';

const transpiler = new TypeScriptToAiScriptTranspiler();

// Add debug logging
console.log('Testing export...');
const result = transpiler.transpile('export const VALUE = 100;');
console.log('Result:', result);
console.log('Stringified:', transpiler.transpileAndStringify('export const VALUE = 100;'));