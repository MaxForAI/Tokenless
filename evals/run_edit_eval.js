#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const postToolUse = path.join(repoRoot, 'plugins', 'claude-code', 'scripts', 'post_tool_use.js');
const preToolUse = path.join(repoRoot, 'plugins', 'claude-code', 'scripts', 'pre_tool_use.js');
const tokenless = path.join(repoRoot, 'plugins', 'claude-code', 'bin', 'tokenless');
const dataDir = path.join(os.tmpdir(), 'tokenless-edit-eval');

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function runHook({ toolName, toolInput, toolResponse }) {
  const payload = JSON.stringify({
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: toolResponse
  });

  return spawnSync(process.execPath, [postToolUse], {
    input: payload,
    encoding: 'utf8',
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: path.join(repoRoot, 'plugins', 'claude-code'),
      CLAUDE_PLUGIN_DATA: dataDir,
      TOKENLESS_STATS_SOURCE: 'eval'
    }
  });
}

function runTokenless(args) {
  return spawnSync(process.execPath, [tokenless, ...args], {
    encoding: 'utf8',
    cwd: repoRoot
  });
}

function runPreHook({ toolName, toolInput }) {
  const payload = JSON.stringify({
    tool_name: toolName,
    tool_input: toolInput
  });

  return spawnSync(process.execPath, [preToolUse], {
    input: payload,
    encoding: 'utf8',
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: path.join(repoRoot, 'plugins', 'claude-code'),
      CLAUDE_PLUGIN_DATA: dataDir,
      TOKENLESS_STATS_SOURCE: 'eval'
    }
  });
}

function parseUpdatedToolOutput(stdout) {
  if (!stdout || !stdout.trim()) return '';
  try {
    const parsed = JSON.parse(stdout);
    return JSON.stringify(parsed.hookSpecificOutput && parsed.hookSpecificOutput.updatedToolOutput || parsed);
  } catch (err) {
    return stdout;
  }
}

function parsePermissionReason(stdout) {
  if (!stdout || !stdout.trim()) return '';
  try {
    const parsed = JSON.parse(stdout);
    return String(parsed.hookSpecificOutput && parsed.hookSpecificOutput.permissionDecisionReason || '');
  } catch (err) {
    return stdout;
  }
}

function artifactIdFrom(text) {
  const match = String(text || '').match(/ctx_\d{8}_\d{6}_[a-z0-9]+/);
  return match && match[0];
}

function containsRawEditPayload(text) {
  return /\b(oldString|newString|originalFile|structuredPatch)\b/.test(String(text || ''));
}

function largeEditResponse(filePath, extra = '') {
  const originalFile = Array.from({ length: 5000 }, (_, i) => {
    return `.card-${i} { color: #06b6d4; background: rgba(3, 6, 16, 0.88); padding: ${i % 40}px; }`;
  }).join('\n');

  return {
    filePath,
    oldString: '    border-radius: 48px;',
    newString: '    border-radius: 52px;',
    originalFile,
    structuredPatch: `${'@@ synthetic patch\n'.repeat(300)}${extra}`,
    userModified: false,
    replaceAll: false,
    content: `${originalFile}\n${extra}`
  };
}

function passLine(name, pass) {
  console.log(`${pass ? 'pass' : 'fail'}: ${name}`);
  return pass;
}

function main() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenless-edit-eval-files-'));
  const cssPath = path.join(tmp, 'large.css');
  const jsPath = path.join(tmp, 'large.js');
  const mdPath = path.join(tmp, 'large.md');
  fs.writeFileSync(cssPath, '.tokenless-real-card { border-radius: 48px; }\n');
  fs.writeFileSync(jsPath, 'console.log("source");\n');
  fs.writeFileSync(mdPath, '# fixture\n');

  const blockedLargeWrite = runPreHook({
    toolName: 'Write',
    toolInput: {
      file_path: cssPath,
      content: Array.from({ length: 260 }, (_, i) => `.card-${i} { color: #22d3ee; }`).join('\n')
    }
  });
  const blockedLargeWriteReason = parsePermissionReason(blockedLargeWrite.stdout);

  const successEdit = runHook({
    toolName: 'Edit',
    toolInput: { file_path: cssPath, old_string: 'a', new_string: 'b' },
    toolResponse: largeEditResponse(cssPath)
  });
  const successEditOutput = parseUpdatedToolOutput(successEdit.stdout);
  const successEditArtifact = artifactIdFrom(successEditOutput);

  const failedEdit = runHook({
    toolName: 'Edit',
    toolInput: { file_path: cssPath, old_string: 'a', new_string: 'b' },
    toolResponse: largeEditResponse(cssPath, '\nError: old_string not found')
  });
  const failedEditOutput = parseUpdatedToolOutput(failedEdit.stdout);

  const successMultiEdit = runHook({
    toolName: 'MultiEdit',
    toolInput: {
      file_path: cssPath,
      edits: [
        { old_string: 'a', new_string: 'b' },
        { old_string: 'c', new_string: 'd' }
      ]
    },
    toolResponse: largeEditResponse(cssPath)
  });
  const successMultiEditOutput = parseUpdatedToolOutput(successMultiEdit.stdout);

  const successCssWrite = runHook({
    toolName: 'Write',
    toolInput: { file_path: cssPath, content: 'x'.repeat(60000) },
    toolResponse: largeEditResponse(cssPath)
  });
  const successCssWriteOutput = parseUpdatedToolOutput(successCssWrite.stdout);

  const successJsWrite = runHook({
    toolName: 'Write',
    toolInput: { file_path: jsPath, content: 'x'.repeat(60000) },
    toolResponse: largeEditResponse(jsPath)
  });
  const successJsWriteOutput = parseUpdatedToolOutput(successJsWrite.stdout);

  const smallEdit = runHook({
    toolName: 'Edit',
    toolInput: { file_path: cssPath, old_string: 'a', new_string: 'b' },
    toolResponse: { filePath: cssPath, oldString: 'a', newString: 'b', userModified: false }
  });
  const smallEditOutput = parseUpdatedToolOutput(smallEdit.stdout);

  const failedWrite = runHook({
    toolName: 'Write',
    toolInput: { file_path: mdPath, content: 'x'.repeat(60000) },
    toolResponse: largeEditResponse(mdPath, '\nFailed: permission denied')
  });
  const failedWriteOutput = parseUpdatedToolOutput(failedWrite.stdout);

  const stats = runTokenless(['stats', '--data-dir', dataDir]).stdout || '';

  console.log('TOKENLESS-EDIT-EVAL/0.1');
  console.log(`success_edit_tokens: ${estimateTokens(JSON.stringify(largeEditResponse(cssPath)))}`);
  console.log(`success_edit_artifact: ${successEditArtifact || '(none)'}`);
  console.log('');

  const checks = [
    ['successful large Edit emits TOKENLESS-EDIT-PACKET', successEditOutput.includes('TOKENLESS-EDIT-PACKET/0.1')],
    ['successful large Edit omits raw edit payload fields', !containsRawEditPayload(successEditOutput)],
    ['successful large Edit creates artifact pointer', Boolean(successEditArtifact)],
    ['failed large Edit passes through without edit packet', !failedEditOutput.includes('TOKENLESS-EDIT-PACKET/0.1')],
    ['successful large MultiEdit emits TOKENLESS-EDIT-PACKET', successMultiEditOutput.includes('TOKENLESS-EDIT-PACKET/0.1')],
    ['successful large MultiEdit omits raw edit payload fields', !containsRawEditPayload(successMultiEditOutput)],
    ['successful CSS Write emits TOKENLESS-WRITE-PACKET', successCssWriteOutput.includes('TOKENLESS-WRITE-PACKET/0.1')],
    ['successful CSS Write omits raw edit payload fields', !containsRawEditPayload(successCssWriteOutput)],
    ['successful source JS Write passes through', !successJsWriteOutput.includes('TOKENLESS-WRITE-PACKET/0.1')],
    ['large existing Write is blocked before execution', blockedLargeWriteReason.includes('TOKENLESS-INPUT-GUARD/0.1') && blockedLargeWriteReason.includes('Write overwrite')],
    ['small Edit passes through', !smallEditOutput.includes('TOKENLESS-EDIT-PACKET/0.1')],
    ['failed Write passes through without write packet', !failedWriteOutput.includes('TOKENLESS-WRITE-PACKET/0.1')],
    ['stats records edit-packet reducer', stats.includes('edit-packet')],
    ['stats records write-packet reducer', stats.includes('write-packet')],
    ['stats marks packets as eval source', stats.includes('- eval:')]
  ];

  const failed = checks.filter(([name, pass]) => !passLine(name, pass));

  if (failed.length) {
    console.log('');
    console.log('failed_checks:');
    for (const [name] of failed) {
      console.log(`- ${name}`);
    }
    process.exit(1);
  }
}

main();
