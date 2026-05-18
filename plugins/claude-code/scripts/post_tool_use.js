#!/usr/bin/env node
'use strict';

const { estimateTokens, compactOutput } = require('../lib/compact');
const { getReducerForOutput } = require('../lib/classify');
const { createArtifactFromFallback, ensureArtifactDir, formatArtifactId, formatArtifactPointer } = require('../lib/artifact_store');
const { shouldCompactRead, summarizeRead } = require('../lib/read_compact');
const { clearReadGate, markReadPacket, refreshReadPacketAfterSmallEdit } = require('../lib/read_gate');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDIT_PACKET_THRESHOLD = 3000;
const WRITE_PACKET_THRESHOLD = 5000;
const RISKY_EDIT_OUTPUT_RE = /\b(error|failed|failure|old_string|not found|multiple matches|ambiguous|permission|denied|conflict|no changes|partial|exception|traceback)\b/i;
const FAILED_TOOL_OUTPUT_RE = /\b(error editing file|file must be read first|old_string not found|string to replace not found|found multiple matches|no changes made|tool failed|edit failed|operation failed|permission denied|traceback \(most recent call last\))/i;

function isTokenlessDisabled() {
  return /^(0|false|off|disabled)$/i.test(String(process.env.TOKENLESS_MODE || '').trim());
}

if (isTokenlessDisabled()) {
  process.exit(0);
}

function getTokenlessCliPath() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  return path.join(pluginRoot, 'bin', 'tokenless');
}

function trace(event) {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(
      path.join(dataDir, 'posttool_trace.log'),
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
      'utf8'
    );
  } catch (err) {
    // Tracing must never affect tool execution.
  }
}

function extractReadText(response) {
  if (typeof response === 'string') return response;
  if (typeof response.content === 'string') return response.content;
  if (typeof response.text === 'string') return response.text;
  if (typeof response.file_content === 'string') return response.file_content;
  if (response && response.file && typeof response.file === 'string') return response.file;
  if (response && response.file && typeof response.file.content === 'string') return response.file.content;
  if (response && response.file && typeof response.file.text === 'string') return response.file.text;
  if (response && response.file && typeof response.file.file_content === 'string') return response.file.file_content;
  if (Array.isArray(response.content)) {
    return response.content.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item.text === 'string') return item.text;
      return '';
    }).join('\n');
  }
  return JSON.stringify(response || {}, null, 2);
}

function replaceLargestString(value, replacement) {
  if (typeof value === 'string') {
    return replacement;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    let bestIndex = -1;
    let bestLength = -1;
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] === 'string' && value[i].length > bestLength) {
        bestIndex = i;
        bestLength = value[i].length;
      }
    }
    if (bestIndex >= 0) {
      const next = [...value];
      next[bestIndex] = replacement;
      return next;
    }
    return value;
  }

  let bestKey = null;
  let bestLength = -1;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && child.length > bestLength) {
      bestKey = key;
      bestLength = child.length;
    }
  }

  if (bestKey) {
    return { ...value, [bestKey]: replacement };
  }

  return { ...value, content: replacement };
}

function replaceReadOutput(response, packetText) {
  if (typeof response === 'string') return packetText;
  if (response && typeof response.content === 'string') return { ...response, content: packetText };
  if (response && typeof response.text === 'string') return { ...response, text: packetText };
  if (response && typeof response.file_content === 'string') return { ...response, file_content: packetText };
  if (response && typeof response.file === 'string') return { ...response, file: packetText };
  if (response && response.file && typeof response.file === 'object') {
    return { ...response, file: replaceLargestString(response.file, packetText) };
  }
  if (response && Array.isArray(response.content)) return { ...response, content: packetText };
  return packetText;
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch (err) {
    return JSON.stringify({ unserializable: err.message });
  }
}

function pickEditPath(toolInput) {
  return toolInput.file_path || toolInput.path || toolInput.notebook_path || '';
}

function isRiskyToolResponse(response, responseText) {
  if (!response || typeof response !== 'object') {
    return RISKY_EDIT_OUTPUT_RE.test(responseText || '');
  }

  if (response.is_error || response.error || response.failed || response.success === false) {
    return true;
  }

  const status = String(response.status || '').toLowerCase();
  if (status && !['success', 'succeeded', 'ok'].includes(status)) {
    return true;
  }

  return RISKY_EDIT_OUTPUT_RE.test(responseText || '');
}

function isFailedToolResponse(response, responseText) {
  if (response && typeof response === 'object') {
    if (response.is_error || response.error || response.failed || response.success === false) {
      return true;
    }

    const status = String(response.status || '').toLowerCase();
    if (status && !['success', 'succeeded', 'ok'].includes(status)) {
      return true;
    }
  }

  return FAILED_TOOL_OUTPUT_RE.test(responseText || '');
}

function isRiskyWritePath(filePath) {
  const normalized = String(filePath || '').toLowerCase();
  const base = path.basename(normalized);
  const ext = path.extname(normalized);

  if (!normalized) return true;
  if (base.startsWith('.env')) return true;
  if (base.includes('lock') || ext === '.lock') return true;
  if (base === 'package.json' || base === 'package-lock.json') return true;
  if (base.includes('config') || base.includes('settings')) return true;
  if (normalized.includes('/.github/') || normalized.includes('/.claude/')) return true;
  if (normalized.includes('dockerfile') || normalized.includes('compose')) return true;

  const sourceExts = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.swift', '.java', '.kt',
    '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.rb',
    '.php', '.scala', '.sh', '.zsh', '.bash'
  ]);
  if (sourceExts.has(ext)) return true;

  return false;
}

function isLowRiskWritePath(filePath) {
  if (isRiskyWritePath(filePath)) return false;

  const normalized = String(filePath || '').toLowerCase();
  const ext = path.extname(normalized);
  const lowRiskExts = new Set([
    '.css', '.scss', '.sass', '.less',
    '.html', '.htm',
    '.md', '.markdown', '.txt', '.log',
    '.svg', '.xml', '.csv', '.tsv'
  ]);

  if (lowRiskExts.has(ext)) return true;
  if (normalized.includes('/generated/') || normalized.includes('/fixtures/') || normalized.includes('/fixture/')) return true;
  if (normalized.includes('/dist/') || normalized.includes('/build/')) return true;
  return false;
}

function packetNameForTool(toolName) {
  if (toolName === 'Write') return 'TOKENLESS-WRITE-PACKET/0.1';
  return 'TOKENLESS-EDIT-PACKET/0.1';
}

function summarizeEditInput(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];

  if (toolName === 'Write') {
    const content = typeof toolInput.content === 'string' ? toolInput.content : '';
    if (!content) return [];
    return [
      'Change shape: full-file Write',
      `Input content: chars=${content.length} lines=${countLines(content)}`,
      'Guardrail: prefer bounded Edit/MultiEdit for existing files; full Write input cannot be retroactively removed from the request that created it.'
    ];
  }

  if (toolName === 'Edit') {
    const oldString = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
    const newString = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
    return [
      'Change shape: single Edit',
      `Input strings: old_chars=${oldString.length} new_chars=${newString.length} old_lines=${countLines(oldString)} new_lines=${countLines(newString)}`
    ];
  }

  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    return [
      'Change shape: MultiEdit',
      `Input edits: count=${edits.length}`
    ];
  }

  return [];
}

function summarizeLargeToolResponse(responseText) {
  const text = String(responseText || '');
  const generatedUtilityMatches = text.match(/generated-utility-/g) || [];
  const selectors = Array.from(new Set(text.match(/\.[A-Za-z_][A-Za-z0-9_-]*(?=\s*[,{])/g) || [])).slice(0, 16);
  const out = [];
  if (generatedUtilityMatches.length) {
    out.push(`Noise detected: generated utility block references=${generatedUtilityMatches.length}`);
  }
  if (selectors.length) {
    out.push(`Touched selectors/classes: ${selectors.join(', ')}`);
  }
  return out;
}

function formatEditPacket({ toolName, toolInput, filePath, beforeTokens, afterTokens, artifactPointer, responseText }) {
  const packetName = packetNameForTool(toolName);
  const stat = filePath ? safeFileStat(filePath) : null;
  const editCount = toolName === 'MultiEdit' && responseText
    ? Math.max(1, (responseText.match(/\bold_string\b/g) || []).length)
    : null;

  const lines = [
    packetName,
    '',
    `Tool: ${toolName}`,
    'Stage: tool_output',
    'Status: success',
    filePath ? `File: ${filePath}` : 'File: unknown',
    stat ? `File state: size=${stat.size} mtime=${new Date(stat.mtimeMs).toISOString()}` : 'File state: unavailable',
    editCount ? `Edits: ${editCount}` : null,
    `Compression: ${beforeTokens} -> ${afterTokens} estimated tokens`,
    '',
    ...summarizeEditInput(toolName, toolInput),
    ...summarizeLargeToolResponse(responseText),
    '',
    'Effect:',
    '- edit/write tool completed successfully',
    '- raw tool result and large diff are stored locally, not repeated here',
    '- file may have changed; use the artifact only if you need exact diff details',
    '- small Edit/MultiEdit calls may continue under the short Tokenless edit lease',
    '- run tokenless read after Write, large edits, external changes, or lease exhaustion',
    '- keep subsequent tool inputs small; do not use large patch scripts as a workaround',
    '',
    `Raw artifact: ${artifactPointer || 'unavailable (post-hook storage failed)'}`,
    ''
  ].filter(Boolean);

  return lines.join('\n');
}

function safeFileStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (err) {
    return null;
  }
}

function replaceToolOutputWithPacket(response, packetText) {
  if (typeof response === 'string') return packetText;
  if (response && typeof response === 'object') {
    const next = {
      type: response.type || 'text',
      content: packetText
    };
    if (response.filePath) next.filePath = response.filePath;
    if (response.file_path) next.file_path = response.file_path;
    return next;
  }
  return packetText;
}

function countLines(text) {
  if (typeof text !== 'string' || !text) return 0;
  return text.split(/\r?\n/).length;
}

function isSmallEditForLease(toolName, toolInput) {
  if (toolName === 'Write') return false;

  if (toolName === 'Edit') {
    if (toolInput.replace_all) return false;
    const oldString = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
    const newString = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
    if (!oldString && !newString) return false;
    const totalChars = oldString.length + newString.length;
    const lineDelta = Math.abs(countLines(newString) - countLines(oldString));
    return totalChars <= 12000 && lineDelta <= 80;
  }

  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    if (!edits.length || edits.length > 8) return false;
    let totalChars = 0;
    let totalLineDelta = 0;
    for (const edit of edits) {
      if (!edit || edit.replace_all) return false;
      const oldString = typeof edit.old_string === 'string' ? edit.old_string : '';
      const newString = typeof edit.new_string === 'string' ? edit.new_string : '';
      totalChars += oldString.length + newString.length;
      totalLineDelta += Math.abs(countLines(newString) - countLines(oldString));
    }
    return totalChars <= 20000 && totalLineDelta <= 120;
  }

  return false;
}

function compactEditLikeTool(toolName, toolInput, response) {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
  const filePath = pickEditPath(toolInput);
  const responseText = safeJson(response);
  const beforeTokens = estimateTokens(responseText);
  const threshold = toolName === 'Write' ? WRITE_PACKET_THRESHOLD : EDIT_PACKET_THRESHOLD;
  const failed = isFailedToolResponse(response, responseText);
  const risky = isRiskyToolResponse(response, responseText);

  if (!failed && isSmallEditForLease(toolName, toolInput)) {
    const lease = refreshReadPacketAfterSmallEdit({ dataDir, filePath, toolName });
    trace({ event: lease.updated ? 'refresh-edit-lease' : 'skip-edit-lease-refresh', reason: lease.reason, toolName, filePath, edits: lease.edits, max_edits: lease.max_edits });
  }

  if (beforeTokens < threshold) {
    trace({ event: 'skip-edit-packet', reason: 'below-threshold', toolName, filePath, tokens: beforeTokens });
    process.exit(0);
  }

  if (risky) {
    trace({ event: 'skip-edit-packet', reason: 'risky-or-failed-output', toolName, filePath, tokens: beforeTokens });
    process.exit(0);
  }

  if (toolName === 'Write' && !isLowRiskWritePath(filePath)) {
    trace({ event: 'skip-edit-packet', reason: 'write-path-not-low-risk', toolName, filePath, tokens: beforeTokens });
    process.exit(0);
  }

  const artifactId = formatArtifactId();
  const artifactPointer = formatArtifactPointer(artifactId, {
    accPath: getTokenlessCliPath(),
    dataDir
  });
  const draftPacket = formatEditPacket({
    toolName,
    toolInput,
    filePath,
    beforeTokens,
    afterTokens: 0,
    artifactPointer,
    responseText
  });
  const afterTokens = estimateTokens(draftPacket);
  const packetText = formatEditPacket({
    toolName,
    toolInput,
    filePath,
    beforeTokens,
    afterTokens,
    artifactPointer,
    responseText
  });

  try {
    ensureArtifactDir(dataDir);
    createArtifactFromFallback({
      dataDir,
      artifactId,
      command: `${toolName} ${filePath || '(unknown file)'}`,
      exitCode: 0,
      reducer: toolName === 'Write' ? 'write-packet' : 'edit-packet',
      stdout: responseText,
      stderr: '',
      compactedText: packetText,
      beforeTokens,
      afterTokens,
      status: 'success',
      source: process.env.TOKENLESS_STATS_SOURCE || 'hook'
    });
  } catch (err) {
    trace({ event: 'skip-edit-packet', reason: 'artifact-storage-failed', toolName, filePath, tokens: beforeTokens, error: err.message });
    process.exit(0);
  }

  trace({ event: 'compact-edit-packet', toolName, filePath, beforeTokens, afterTokens, artifactId });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: replaceToolOutputWithPacket(response, packetText)
      }
    })
  );
}

function compactReadTool(input, toolInput, response) {
  const filePath = toolInput.file_path || toolInput.path || '';
  const text = extractReadText(response);
  const tokens = estimateTokens(text);

  if (!shouldCompactRead({ filePath, text, tokens })) {
    trace({ event: 'skip-read', reason: 'below-threshold-or-risky', filePath, tokens });
    process.exit(0);
  }

  const artifactId = formatArtifactId();
  const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
  const packet = summarizeRead({
    filePath,
    text,
    artifactId,
    tokenlessPath: getTokenlessCliPath(),
    dataDir
  });

  try {
    ensureArtifactDir(dataDir);
    createArtifactFromFallback({
      dataDir,
      artifactId,
      command: `Read ${filePath}`,
      exitCode: 0,
      reducer: 'read-packet',
      stdout: text,
      stderr: '',
      compactedText: packet.text,
      beforeTokens: tokens,
      afterTokens: packet.afterTokens,
      status: 'success',
      source: process.env.TOKENLESS_STATS_SOURCE || 'hook'
    });
    clearReadGate({ dataDir, filePath });
    markReadPacket({
      dataDir,
      filePath,
      artifactId,
      estimatedTokens: tokens
    });
  } catch (err) {
    trace({ event: 'read-artifact-error', filePath, tokens, error: err.message });
    // If storage fails, still cap the model-visible output with an unavailable artifact marker.
  }

  trace({ event: 'compact-read', filePath, beforeTokens: packet.beforeTokens, afterTokens: packet.afterTokens, artifactId });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: replaceReadOutput(response, packet.text)
      }
    })
  );
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (err) {
    process.exit(0);
  }

  if (!raw || !raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    process.exit(0);
  }

  const toolName = input.tool_name || input.toolName;
  const toolInput = input.tool_input || input.toolInput || {};
  const response = input.tool_response || input.toolResponse || {};
  trace({
    event: 'seen',
    toolName: toolName || 'unknown',
    toolInputKeys: Object.keys(toolInput || {}),
    responseKeys: response && typeof response === 'object' ? Object.keys(response) : [`type:${typeof response}`]
  });

  if (toolName === 'Read') {
    compactReadTool(input, toolInput, response);
    return;
  }

  if (['Edit', 'MultiEdit', 'Write'].includes(toolName)) {
    compactEditLikeTool(toolName, toolInput, response);
    return;
  }

  if (toolName !== 'Bash') {
    process.exit(0);
  }

  const command = toolInput.command || '';
  const stdout = response.stdout || '';
  const stderr = response.stderr || '';
  const interrupted = Boolean(response.interrupted);
  const isImage = Boolean(response.isImage);
  const exitCode = Number.isInteger(response.exit_code)
    ? response.exit_code
    : (Number.isInteger(response.exitCode) ? response.exitCode : 0);

  const combined = `${stdout}\n${stderr}`;
  if (estimateTokens(combined) < 8000) {
    process.exit(0);
  }

  const reducer = getReducerForOutput({ command, stdout, stderr }) || 'bash_generic';
  const compacted = compactOutput({
    tool: 'Bash',
    command,
    exitCode,
    stdout,
    stderr,
    reducer,
    artifactId: null,
    dataDir: process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless'),
    beforeText: combined
  });

  let artifactId;
  try {
    ensureArtifactDir(process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless'));
    const stored = createArtifactFromFallback({
      dataDir: process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless'),
      command,
      exitCode,
      reducer,
      stdout,
      stderr,
      compactedText: compacted.text,
      beforeTokens: compacted.beforeTokens,
      afterTokens: compacted.afterTokens,
      status: compacted.status,
      source: process.env.TOKENLESS_STATS_SOURCE || 'hook'
    });
    artifactId = stored.artifact_id;
  } catch (err) {
    artifactId = null;
  }

  const artifactPointer = artifactId
    ? formatArtifactPointer(artifactId, {
      accPath: getTokenlessCliPath(),
      dataDir: process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless')
    })
    : null;
  const compactText = compacted.text.replace('Raw artifact: tokenless show null', artifactPointer ? `Raw artifact: ${artifactPointer}` : 'Raw artifact: unavailable (post-hook storage failed)');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: {
          stdout: compactText,
          stderr: '',
          interrupted,
          isImage
        }
      }
    })
  );
}

main();
