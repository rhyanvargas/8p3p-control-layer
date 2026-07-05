/**
 * Render-check every Mermaid fenced block in docs, README, and plan markdown.
 * Uses @mermaid-js/mermaid-cli@11.16.0 (devDependency).
 * architecture-beta requires Mermaid ≥ 11.1.0.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const MMDC = join(ROOT, 'node_modules', '.bin', 'mmdc');
const SCAN_ROOTS = [
  join(ROOT, 'docs'),
  join(ROOT, 'README.md'),
  join(ROOT, '.cursor', 'plans'),
];

function collectMarkdownFiles(path) {
  const files = [];
  if (path.endsWith('.md')) {
    files.push(path);
    return files;
  }

  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectMarkdownFiles(full));
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }

  return files;
}

function extractMermaidBlocks(content) {
  const blocks = [];
  const fence = /```mermaid\r?\n([\s\S]*?)```/g;
  let match;
  let index = 0;

  while ((match = fence.exec(content)) !== null) {
    index += 1;
    const source = match[1].trimEnd();
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    blocks.push({ index, line, source });
  }

  return blocks;
}

function validateDiagram(source) {
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-validate-'));

  try {
    const input = join(dir, 'diagram.mmd');
    const output = join(dir, 'diagram.svg');
    writeFileSync(input, source, 'utf8');

    const result = spawnSync(MMDC, ['-i', input, '-o', output, '-q'], {
      encoding: 'utf8',
      env: process.env,
    });

    if (result.status === 0) {
      return null;
    }

    return (result.stderr || result.stdout || `mmdc exited with status ${result.status}`).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const markdownFiles = SCAN_ROOTS.flatMap((path) => collectMarkdownFiles(path));
let failed = false;
let diagramCount = 0;

for (const file of markdownFiles.sort()) {
  const content = readFileSync(file, 'utf8');
  const blocks = extractMermaidBlocks(content);
  if (blocks.length === 0) continue;

  const rel = relative(ROOT, file);

  for (const block of blocks) {
    diagramCount += 1;
    const error = validateDiagram(block.source);
    if (error) {
      failed = true;
      console.error(`✗ ${rel}#${block.index} (line ${block.line}): ${error}`);
    } else {
      console.log(`✓ ${rel}#${block.index} (line ${block.line})`);
    }
  }
}

if (diagramCount === 0) {
  console.log('No Mermaid diagrams found.');
  process.exit(0);
}

if (failed) {
  console.error(`\nMermaid validation failed (${diagramCount} diagram(s) scanned).`);
  process.exit(1);
}

console.log(`\nMermaid validation passed (${diagramCount} diagram(s)).`);
