#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const tokenless = path.join(repoRoot, 'plugins', 'claude-code', 'bin', 'tokenless');
const postToolUse = path.join(repoRoot, 'plugins', 'claude-code', 'scripts', 'post_tool_use.js');
const dataDir = path.join(os.tmpdir(), 'tokenless-read-eval');

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function runHook(filePath, content) {
  const payload = JSON.stringify({
    tool_name: 'Read',
    tool_input: { file_path: filePath },
    tool_response: { type: 'text', file: content }
  });

  return spawnSync('node', [postToolUse], {
    input: payload,
    encoding: 'utf8',
    cwd: repoRoot,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, TOKENLESS_STATS_SOURCE: 'eval' }
  });
}

function runTokenless(args) {
  return spawnSync('node', [tokenless, ...args], {
    encoding: 'utf8',
    cwd: repoRoot
  });
}

function buildLargeCss() {
  const lines = [
    '/* synthetic large css */',
    ':root { --primary: #06b6d4; --accent: #f97316; }'
  ];

  for (let i = 0; i < 520; i++) {
    lines.push(`.filler-${i} { color: #${String(i).padStart(6, '0').slice(0, 6)}; padding: ${i}px; margin: ${i % 20}px; }`);
  }

  lines.push('.target-card {');
  lines.push('  border-radius: 20px;');
  lines.push('  background: linear-gradient(135deg, #06b6d4, #f97316);');
  lines.push('  box-shadow: 0 20px 60px rgba(6, 182, 212, 0.3);');
  lines.push('}');

  for (let i = 520; i < 1040; i++) {
    lines.push(`.filler-${i} { color: #${String(i).padStart(6, '0').slice(0, 6)}; padding: ${i}px; margin: ${i % 20}px; }`);
  }

  return lines.join('\n');
}

function passLine(name, pass) {
  console.log(`${pass ? 'pass' : 'fail'}: ${name}`);
  return pass;
}

function main() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const largeCss = buildLargeCss();
  const largeCssResult = runHook('/tmp/tokenless-large-style.css', largeCss);
  const largeCssOutput = largeCssResult.stdout || '';
  const artifactMatch = largeCssOutput.match(/ctx_\d{8}_\d{6}_[a-z0-9]+/);
  const artifactId = artifactMatch && artifactMatch[0];

  const around = artifactId
    ? runTokenless(['expand', artifactId, '--around', '.target-card', '--data-dir', dataDir]).stdout || ''
    : '';
  const lineWindow = artifactId
    ? runTokenless(['expand', artifactId, '--lines', '520:535', '--data-dir', dataDir]).stdout || ''
    : '';
  const stats = runTokenless(['stats', '--data-dir', dataDir]).stdout || '';

  const smallCss = '.card { border-radius: 20px; }\n'.repeat(100);
  const smallCssOutput = runHook('/tmp/small.css', smallCss).stdout || '';

  const largeSource = Array.from({ length: 2000 }, (_, i) => `export function fn${i}() { return ${i}; }`).join('\n');
  const largeSourceOutput = runHook('/tmp/large.ts', largeSource).stdout || '';

  console.log('TOKENLESS-READ-EVAL/0.1');
  console.log(`large_css_tokens: ${estimateTokens(largeCss)}`);
  console.log(`small_css_tokens: ${estimateTokens(smallCss)}`);
  console.log(`large_source_tokens: ${estimateTokens(largeSource)}`);
  console.log(`artifact_id: ${artifactId || '(none)'}`);
  console.log('');

  const checks = [
    ['large css emits TOKENLESS-READ-PACKET', largeCssOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large css creates artifact', Boolean(artifactId)],
    ['expand --around finds target selector', around.includes('.target-card')],
    ['expand --around preserves exact editable property', around.includes('border-radius: 20px')],
    ['expand --lines returns numbered lines', /^520:|\n520:|^521:|\n521:/.test(lineWindow)],
    ['stats records read-packet', stats.includes('read-packet')],
    ['stats marks read-packet as eval source', stats.includes('- eval:')],
    ['small css stays raw', !smallCssOutput.includes('TOKENLESS-READ-PACKET/0.1')],
    ['large source stays raw by default', !largeSourceOutput.includes('TOKENLESS-READ-PACKET/0.1')]
  ];

  const failed = checks.filter(([name, pass]) => !passLine(name, pass));

  console.log('');
  console.log('around_sample:');
  console.log(around.split(/\r?\n/).filter((line) => {
    return line.includes('.target-card') || line.includes('border-radius') || line.includes('background');
  }).slice(0, 8).join('\n'));

  if (failed.length) {
    process.exit(1);
  }
}

main();
