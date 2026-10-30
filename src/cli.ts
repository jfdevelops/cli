#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createProgram } from './program.js';

async function readVersion() {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

  return manifest.version;
}

await createProgram(await readVersion()).parseAsync();
