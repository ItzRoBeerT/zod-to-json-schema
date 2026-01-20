#!/usr/bin/env node

/**
 * CLI wrapper that uses tsx to run the TypeScript source directly
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPath = path.join(__dirname, '..', 'src', 'index.ts');

// Forward all arguments to the TypeScript CLI
const args = process.argv.slice(2);

const child = spawn('npx', ['tsx', srcPath, ...args], {
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
