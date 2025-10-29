#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Make CLI executable
const cliPath = path.join('dist', 'bin', 'cli.js');
if (fs.existsSync(cliPath)) {
  fs.chmodSync(cliPath, '755');
  console.log('✅ Made CLI executable');
}

console.log('📦 Package is ready for publication!');
console.log('');
console.log('Next steps:');
console.log('1. Update author field in package.json');
console.log('2. Update repository URLs in package.json');
console.log('3. Run: npm publish');