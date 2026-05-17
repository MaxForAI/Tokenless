#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const realDir = path.join(__dirname, 'cases', 'real');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

function safeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function commandExists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    encoding: 'utf8'
  });
  return result.status === 0;
}

function run(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: Number.isInteger(result.status) ? result.status : 1
  };
}

function saveCase(definition, result) {
  mkdirp(realDir);
  const slug = safeSlug(definition.name);
  const stdoutFile = `${slug}.stdout.log`;
  const stderrFile = `${slug}.stderr.log`;
  const caseFile = `${slug}.case.json`;

  write(path.join(realDir, stdoutFile), result.stdout);
  write(path.join(realDir, stderrFile), result.stderr);

  const caseJson = {
    name: definition.name,
    command: definition.command,
    exitCode: result.exitCode,
    stdoutFile,
    stderrFile,
    expectedReducer: definition.expectedReducer,
    mustContain: definition.mustContain || [],
    mustExpandAround: definition.mustExpandAround || [],
    maxTokensAfter: definition.maxTokensAfter,
    maxRatioPercent: definition.maxRatioPercent,
    minTokensForRatio: definition.minTokensForRatio || 1000
  };

  write(path.join(realDir, caseFile), `${JSON.stringify(caseJson, null, 2)}\n`);

  return {
    caseFile: path.join(realDir, caseFile),
    exitCode: result.exitCode,
    stdoutBytes: Buffer.byteLength(result.stdout),
    stderrBytes: Buffer.byteLength(result.stderr)
  };
}

function createNpmTestCase(root) {
  const dir = path.join(root, 'npm-test-node-failure');
  mkdirp(path.join(dir, 'test'));
  write(path.join(dir, 'package.json'), JSON.stringify({
    scripts: {
      test: 'node --test'
    }
  }, null, 2));
  write(path.join(dir, 'test', 'parser.test.js'), [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    '',
    "test('parse token count', () => {",
    "  const expected = 312;",
    "  const received = 318;",
    '  assert.equal(received, expected);',
    '});',
    ''
  ].join('\n'));

  return {
    name: 'real-npm-test-node-failure',
    command: 'npm test',
    cwd: dir,
    expectedReducer: 'test-log',
    mustContain: ['AssertionError', 'parse token count', 'expected', 'actual'],
    mustExpandAround: ['AssertionError'],
    maxTokensAfter: 2400,
    maxRatioPercent: 80
  };
}

function createNpmTestLargeCase(root) {
  const dir = path.join(root, 'npm-test-large-node-failure');
  mkdirp(path.join(dir, 'test'));
  write(path.join(dir, 'package.json'), JSON.stringify({
    scripts: {
      test: 'node --test'
    }
  }, null, 2));

  for (let i = 0; i < 120; i++) {
    write(path.join(dir, 'test', `pass-${String(i).padStart(3, '0')}.test.js`), [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      '',
      `test('passing case ${i}', () => {`,
      `  assert.equal(${i}, ${i});`,
      '});',
      ''
    ].join('\n'));
  }

  write(path.join(dir, 'test', 'parser-failure.test.js'), [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    '',
    "test('parse token count regression', () => {",
    "  const expected = 312;",
    "  const received = 318;",
    '  assert.equal(received, expected);',
    '});',
    ''
  ].join('\n'));

  return {
    name: 'real-npm-test-large-node-failure',
    command: 'npm test',
    cwd: dir,
    expectedReducer: 'test-log',
    mustContain: ['AssertionError', 'parse token count regression', 'expected', 'actual'],
    mustExpandAround: ['parse token count regression'],
    maxTokensAfter: 2600,
    maxRatioPercent: 35
  };
}

function createNpmBuildLargeCase(root) {
  const dir = path.join(root, 'npm-build-large-failure');
  mkdirp(dir);
  write(path.join(dir, 'package.json'), JSON.stringify({
    scripts: {
      build: 'node build.js'
    }
  }, null, 2));
  write(path.join(dir, 'build.js'), [
    'for (let i = 0; i < 1500; i++) {',
    '  console.log(`vite progress ${i}: transformed module_${i}.js`);',
    '}',
    "console.error(\"src/App.tsx:12:20 - error TS2307: Cannot find module './components/MissingPanel' or its corresponding type declarations.\");",
    "console.error(\"Process completed with exit code 2\");",
    'process.exit(2);',
    ''
  ].join('\n'));

  return {
    name: 'real-npm-build-large-failure',
    command: 'npm run build',
    cwd: dir,
    expectedReducer: 'ci-build',
    mustContain: ['failed phase: build', 'Cannot find module', 'src/App.tsx:12'],
    mustExpandAround: ['Cannot find module'],
    maxTokensAfter: 2200,
    maxRatioPercent: 10
  };
}

function createGitDiffCase(root) {
  if (!commandExists('git')) return null;

  const dir = path.join(root, 'git-diff-real');
  mkdirp(path.join(dir, 'src'));
  run('git init', dir);
  run('git config user.email tokenless@example.test', dir);
  run('git config user.name Tokenless', dir);
  write(path.join(dir, 'src', 'parser.js'), [
    'function parse(input) {',
    '  return input.trim();',
    '}',
    '',
    'module.exports = { parse };',
    ''
  ].join('\n'));
  run('git add src/parser.js', dir);
  run('git commit -m init', dir);
  write(path.join(dir, 'src', 'parser.js'), [
    'function parse(input) {',
    '  const safe = String(input || "");',
    '  return safe.trim().toLowerCase();',
    '}',
    '',
    'function countTokens(input) {',
    '  return parse(input).split(/\\s+/).filter(Boolean).length;',
    '}',
    '',
    'module.exports = { parse, countTokens };',
    ''
  ].join('\n'));

  return {
    name: 'real-git-diff-parser-change',
    command: 'git diff',
    cwd: dir,
    expectedReducer: 'git-diff',
    mustContain: ['diff --git', 'src/parser.js', '@@', 'countTokens'],
    mustExpandAround: ['diff --git'],
    maxTokensAfter: 2200,
    maxRatioPercent: 90
  };
}

function createGitDiffLargeCase(root) {
  if (!commandExists('git')) return null;

  const dir = path.join(root, 'git-diff-large-real');
  mkdirp(path.join(dir, 'src'));
  run('git init', dir);
  run('git config user.email tokenless@example.test', dir);
  run('git config user.name Tokenless', dir);
  write(path.join(dir, 'src', 'generated.js'), [
    'export const generated = [];',
    ''
  ].join('\n'));
  run('git add src/generated.js', dir);
  run('git commit -m init', dir);

  const lines = ['export const generated = ['];
  for (let i = 0; i < 900; i++) {
    lines.push(`  "generatedLine${i}",`);
  }
  lines.push('];');
  lines.push('');
  write(path.join(dir, 'src', 'generated.js'), lines.join('\n'));

  return {
    name: 'real-git-diff-large-generated-change',
    command: 'git diff',
    cwd: dir,
    expectedReducer: 'git-diff',
    mustContain: ['diff --git', 'src/generated.js', '@@', 'generatedLine0'],
    mustExpandAround: ['generatedLine899'],
    maxTokensAfter: 2400,
    maxRatioPercent: 15
  };
}

function createRgCase(root) {
  if (!commandExists('rg')) return null;

  const dir = path.join(root, 'rg-real');
  mkdirp(path.join(dir, 'src'));
  mkdirp(path.join(dir, 'node_modules', 'pkg'));
  write(path.join(dir, 'src', 'parser.js'), [
    'function parse(input) {',
    '  // TODO: handle quoted delimiters',
    '  return input.split(":");',
    '}',
    ''
  ].join('\n'));
  write(path.join(dir, 'src', 'tokenizer.js'), [
    '// FIXME: unicode token handling',
    'function tokenize(input) {',
    '  return input.trim().split(/\\s+/);',
    '}',
    ''
  ].join('\n'));
  write(path.join(dir, 'node_modules', 'pkg', 'index.js'), '// TODO: ignored dependency\n');

  return {
    name: 'real-rg-todo-search',
    command: 'rg -n "TODO|FIXME" .',
    cwd: dir,
    expectedReducer: 'search-output',
    mustContain: ['src/parser.js', 'src/tokenizer.js', 'line'],
    mustExpandAround: ['TODO'],
    maxTokensAfter: 1200,
    maxRatioPercent: 90
  };
}

function createRgLargeCase(root) {
  if (!commandExists('rg')) return null;

  const dir = path.join(root, 'rg-large-real');
  mkdirp(path.join(dir, 'src'));
  mkdirp(path.join(dir, 'node_modules', 'pkg'));
  write(path.join(dir, 'src', 'target.js'), [
    '// TODO: preserve this target match',
    'export function target() {',
    '  return "target";',
    '}',
    ''
  ].join('\n'));

  const noise = [];
  for (let i = 0; i < 1200; i++) {
    noise.push(`// TODO noise match ${i}`);
  }
  write(path.join(dir, 'src', 'noise.js'), `${noise.join('\n')}\n`);
  write(path.join(dir, 'node_modules', 'pkg', 'index.js'), `${noise.slice(0, 100).join('\n')}\n`);

  return {
    name: 'real-rg-large-todo-search',
    command: 'rg -n TODO .',
    cwd: dir,
    expectedReducer: 'search-output',
    mustContain: ['src/target.js', 'src/noise.js', 'more matches omitted'],
    mustExpandAround: ['TODO noise match 1199'],
    maxTokensAfter: 1500,
    maxRatioPercent: 8
  };
}

function createFindCase(root) {
  const dir = path.join(root, 'find-real');
  mkdirp(path.join(dir, 'src', 'core'));
  mkdirp(path.join(dir, 'tests'));
  mkdirp(path.join(dir, 'node_modules', 'pkg'));
  mkdirp(path.join(dir, 'coverage'));
  write(path.join(dir, 'src', 'core', 'parser.js'), 'module.exports = {};\n');
  write(path.join(dir, 'src', 'core', 'tokenizer.js'), 'module.exports = {};\n');
  write(path.join(dir, 'tests', 'parser.test.js'), 'test("x", () => {});\n');
  write(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};\n');
  write(path.join(dir, 'coverage', 'index.html'), '<html></html>\n');

  return {
    name: 'real-find-project-tree',
    command: 'find . -maxdepth 4 -type f',
    cwd: dir,
    expectedReducer: 'file-tree',
    mustContain: ['Project tree summary:', 'src/', 'tests/', 'Large dirs collapsed:'],
    mustExpandAround: ['src/core/parser.js'],
    maxTokensAfter: 900,
    maxRatioPercent: 90
  };
}

function createFindLargeCase(root) {
  const dir = path.join(root, 'find-large-real');
  for (let i = 0; i < 40; i++) {
    mkdirp(path.join(dir, 'src', `pkg-${i}`));
    write(path.join(dir, 'src', `pkg-${i}`, 'index.js'), 'module.exports = {};\n');
    write(path.join(dir, 'src', `pkg-${i}`, 'parser.js'), 'module.exports = {};\n');
  }
  for (let i = 0; i < 20; i++) {
    mkdirp(path.join(dir, 'tests', `suite-${i}`));
    write(path.join(dir, 'tests', `suite-${i}`, 'parser.test.js'), 'test("x", () => {});\n');
  }
  for (let i = 0; i < 300; i++) {
    mkdirp(path.join(dir, 'node_modules', 'pkg', String(i)));
    write(path.join(dir, 'node_modules', 'pkg', String(i), 'index.js'), 'module.exports = {};\n');
  }
  for (let i = 0; i < 100; i++) {
    mkdirp(path.join(dir, 'coverage', String(i)));
    write(path.join(dir, 'coverage', String(i), 'index.html'), '<html></html>\n');
  }

  return {
    name: 'real-find-large-project-tree',
    command: 'find . -maxdepth 5 -type f',
    cwd: dir,
    expectedReducer: 'file-tree',
    mustContain: ['Project tree summary:', 'src/', 'tests/', 'Large dirs collapsed:', 'node_modules/'],
    mustExpandAround: ['src/pkg-39/parser.js'],
    maxTokensAfter: 1000,
    maxRatioPercent: 12
  };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenless-real-cases-'));
  const definitions = [
    createNpmTestCase(root),
    createNpmTestLargeCase(root),
    createNpmBuildLargeCase(root),
    createGitDiffCase(root),
    createGitDiffLargeCase(root),
    createRgCase(root),
    createRgLargeCase(root),
    createFindCase(root),
    createFindLargeCase(root)
  ].filter(Boolean);

  let count = 0;
  for (const definition of definitions) {
    const result = run(definition.command, definition.cwd);
    const saved = saveCase(definition, result);
    count += 1;
    console.log(`case: ${definition.name}`);
    console.log(`file: ${saved.caseFile}`);
    console.log(`exitCode: ${saved.exitCode}`);
    console.log(`stdout bytes: ${saved.stdoutBytes}`);
    console.log(`stderr bytes: ${saved.stderrBytes}`);
    console.log('---');
  }

  console.log(`generated: ${count}`);
}

main();
