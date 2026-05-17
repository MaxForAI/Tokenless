#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { estimateTokens } = require('../plugins/claude-code/lib/compact');
const { readArtifact, expandArtifactAround } = require('../plugins/claude-code/lib/artifact_store');

function emitComplexFailureLog() {
  const out = [];

  out.push('> complex-app@9.9.9 test');
  out.push('> npm run lint && mocha --recursive test integration ui');
  out.push('');
  out.push('> complex-app@9.9.9 lint');
  out.push('> eslint .');
  out.push('');

  for (let i = 0; i < 500; i++) {
    out.push(`setup noise ${i}: package extracted, cache hit, progress ${(i % 100)}%`);
  }

  out.push('');
  out.push('  Parser units');
  for (let i = 0; i < 180; i++) {
    out.push(`    ✓ passing-parser-case-${i}`);
  }

  out.push('');
  out.push('  Load errors');
  for (let i = 0; i < 90; i++) {
    out.push(`    ✓ passing-load-error-name-${i}`);
  }

  out.push('    1) BOM strip');
  out.push('    2) Allow astral characters');
  out.push('    3) Loading multidocument source using load should cause an error');
  out.push('    4) Resolver cannot load schema');
  out.push('    5) Async upload retries timeout');
  out.push('    6) Header snapshot remains stable');
  out.push('    7) Alias nodes recursive object');

  for (let i = 8; i <= 60; i++) {
    const family = i % 5;
    if (family === 0) out.push(`    ${i}) Regression family ${i} returns wrapped array`);
    else if (family === 1) out.push(`    ${i}) Regression family ${i} cannot resolve schema`);
    else if (family === 2) out.push(`    ${i}) Regression family ${i} async timeout`);
    else if (family === 3) out.push(`    ${i}) Regression family ${i} snapshot drift`);
    else out.push(`    ${i}) Regression family ${i} alias self reference`);
  }

  out.push('');
  out.push('');
  out.push('  225 passing (4s)');
  out.push('  3 pending');
  out.push('  60 failing');
  out.push('');

  const blocks = [
    [
      '  1) Parser units',
      '       BOM strip:',
      '     AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:',
      '     + actual - expected',
      '     + [',
      "     +   { foo: 'bar' }",
      '     + ]',
      "     - { foo: 'bar' }",
      '      at Context.<anonymous> (test/units/bom-strip.js:9:10)',
      '      at process.processImmediate (node:internal/timers:505:21)'
    ],
    [
      '  2) Parser units',
      '       Allow astral characters:',
      '     AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:',
      '     + actual - expected',
      "     + [ { 'key': 'value' } ]",
      "     - { 'key': 'value' }",
      '      at Context.<anonymous> (test/units/character-set.js:9:10)',
      '      at process.processImmediate (node:internal/timers:505:21)'
    ],
    [
      '  3) Parser units',
      '       Loading multidocument source using load should cause an error:',
      '     AssertionError [ERR_ASSERTION]: Missing expected exception (YAMLException).',
      '      at Context.<anonymous> (test/units/single-document-error.js:9:10)',
      '      at process.processImmediate (node:internal/timers:505:21)'
    ],
    [
      '  4) Build resolver',
      '       Resolver cannot load schema:',
      "     Error: Cannot find module './generated/schema'",
      '      at resolveSchema (src/compiler/resolve.ts:88:17)',
      '      at compileProject (src/compiler/index.ts:41:9)'
    ],
    [
      '  5) Integration upload',
      '       Async upload retries timeout:',
      '     Error: Timeout of 5000ms exceeded. For async tests and hooks, ensure done() is called.',
      '      at Context.<anonymous> (test/integration/upload.test.ts:144:12)'
    ],
    [
      '  6) UI snapshots',
      '       Header snapshot remains stable:',
      '     AssertionError: Snapshot mismatch',
      '      at Context.<anonymous> (tests/ui/Header.test.tsx:42:7)'
    ],
    [
      '  7) Alias nodes',
      '       Alias nodes recursive object:',
      "     TypeError: Cannot read properties of undefined (reading 'self')",
      '      at Context.<anonymous> (test/units/alias-nodes.js:39:32)'
    ]
  ];

  for (const block of blocks) {
    out.push(...block);
    out.push('');
  }

  for (let i = 8; i <= 60; i++) {
    out.push(`  ${i}) Mixed suite`);
    out.push(`       Regression family ${i}:`);
    if (i % 5 === 0) {
      out.push('     AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:');
      out.push('     + actual - expected');
      out.push('     + [ { value: 1 } ]');
      out.push('     - { value: 1 }');
      out.push(`      at Context.<anonymous> (test/units/regression-${i}.js:${20 + i}:10)`);
    } else if (i % 5 === 1) {
      out.push("     Error: Cannot find module './generated/schema'");
      out.push(`      at resolveSchema (src/compiler/resolve.ts:${80 + i}:17)`);
    } else if (i % 5 === 2) {
      out.push('     Error: Timeout of 5000ms exceeded. For async tests and hooks, ensure done() is called.');
      out.push(`      at Context.<anonymous> (test/integration/retry-${i}.test.ts:${100 + i}:12)`);
    } else if (i % 5 === 3) {
      out.push('     AssertionError: Snapshot mismatch');
      out.push(`      at Context.<anonymous> (tests/ui/Component${i}.test.tsx:${30 + i}:7)`);
    } else {
      out.push("     TypeError: Cannot read properties of undefined (reading 'self')");
      out.push(`      at Context.<anonymous> (test/units/alias-${i}.js:${35 + i}:32)`);
    }
    for (let repeat = 0; repeat < 6; repeat++) {
      out.push(`      at repeatedFrame${repeat} (node_modules/some-lib/dist/index.js:${repeat + 1}:1)`);
    }
    out.push('');
  }

  for (let i = 0; i < 400; i++) {
    out.push(`teardown noise ${i}: cleanup worker ${i % 12}, warning repeated line`);
  }

  process.stdout.write(out.join('\n'));
  process.exit(1);
}

function fail(message, failures) {
  failures.push(message);
}

function main() {
  if (process.argv.includes('--emit')) {
    emitComplexFailureLog();
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const accPath = path.join(repoRoot, 'plugins', 'claude-code', 'bin', 'acc');
  const dataDir = path.join(os.tmpdir(), 'tokenless-complex-test-log');
  fs.rmSync(dataDir, { recursive: true, force: true });

  const rawPreview = spawnSync(process.execPath, [__filename, '--emit'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const rawText = `${rawPreview.stdout || ''}\n${rawPreview.stderr || ''}`;

  const result = spawnSync(process.execPath, [
    accPath,
    'run',
    '--agent',
    '--data-dir',
    dataDir,
    '--',
    process.execPath,
    __filename,
    '--emit'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const failures = [];

  const mustContain = [
    'TOKENLESS-PACKET/0.1',
    'Status: failed',
    'Original exit code: 1',
    'Reducer: test-log',
    '60 failing',
    'Failure families:',
    'Wrapped array/object shape mismatch',
    'Missing module: ./generated/schema',
    'Async timeout',
    'Failure index (first 25):',
    'Resolver cannot load schema',
    'Async upload retries timeout',
    'Header snapshot remains stable',
    'Representative failure details:',
    'test/units/bom-strip.js:9',
    'failure index truncated after first 25 failures'
  ];

  for (const token of mustContain) {
    if (!output.includes(token)) fail(`missing compacted token: ${token}`, failures);
  }

  const mustNotContain = [
    'passing-parser-case-179',
    'setup noise 499',
    'teardown noise 399',
    'repeatedFrame5'
  ];

  for (const token of mustNotContain) {
    if (output.includes(token)) fail(`noisy token leaked: ${token}`, failures);
  }

  const artifactMatch = /show\s+(ctx_\d{8}_\d{6}_[a-z0-9]+)\s+--data-dir/.exec(output);
  if (!artifactMatch) {
    fail('missing artifact pointer', failures);
  } else {
    const artifact = readArtifact(dataDir, artifactMatch[1]);
    if (!artifact) {
      fail(`artifact not readable: ${artifactMatch[1]}`, failures);
    } else {
      const expanded = expandArtifactAround(artifact, 'Regression family 44');
      if (!expanded.includes('Regression family 44')) {
        fail('raw artifact expand did not find omitted failure', failures);
      }
    }
  }

  const before = estimateTokens(rawText);
  const after = estimateTokens(output);
  const ratio = before > 0 ? Number(((after / before) * 100).toFixed(1)) : 0;

  if (after > 2200) fail(`compressed output too large: ${after} tokens`, failures);
  if (ratio > 18) fail(`compression ratio too high: ${ratio}%`, failures);

  console.log('TOKENLESS-COMPLEX-TEST/0.1');
  console.log(`raw tokens: ${before}`);
  console.log(`compressed tokens: ${after}`);
  console.log(`ratio: ${ratio}%`);
  console.log(`tokenless exit code: ${result.status}`);
  console.log(`pass: ${failures.length === 0 ? 'yes' : 'no'}`);
  if (failures.length) {
    for (const item of failures) {
      console.log(`failure: ${item}`);
    }
    console.log('');
    console.log('--- compacted output preview ---');
    console.log(output.split(/\r?\n/).slice(0, 140).join('\n'));
    process.exit(1);
  }

  console.log('');
  console.log('Preserved signals: failure summary, first 25 failure index, representative details, file:line hints, raw artifact expand.');
}

main();
