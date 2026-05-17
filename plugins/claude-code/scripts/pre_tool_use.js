#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { isNoisyCommand } = require('../lib/classify');
const { shouldCompactRead } = require('../lib/read_compact');
const {
  setReadGate,
  getReadGate,
  getReadPacket,
  getReadPacketState,
  findGateForCommand,
  extractFilePathCandidates,
  isLikelyFileAccessCommand
} = require('../lib/read_gate');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
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
      path.join(dataDir, 'pretool_trace.log'),
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
      'utf8'
    );
  } catch (err) {
    // Tracing must never break tool execution.
  }
}

function getPermissionDecision() {
  const value = String(process.env.TOKENLESS_PRETOOL_PERMISSION || 'deny').trim();
  if (value === 'allow' || value === 'ask' || value === 'deny') {
    return value;
  }
  return 'deny';
}

function isTokenlessCommand(command) {
  return /^\s*(tokenless|acc)(\s|$)/.test(command) ||
    /\/bin\/(tokenless|acc)['"]?\s+(?:run|read)\s+/.test(command) ||
    /^\s*node\s+['"][^'"]*\/bin\/(?:tokenless|acc)['"]\s+(?:run|read)\s+/.test(command);
}

function getDataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
}

function buildTokenlessReadCommand(filePath, dataDir) {
  return `node ${shellQuote(getTokenlessCliPath())} read --agent --data-dir ${shellQuote(dataDir)} ${shellQuote(filePath)}`;
}

function getLargeLowRiskReadCandidate(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return null;
  }

  if (!stat.isFile()) return null;

  const estimatedTokens = Math.max(1, Math.ceil(stat.size / 4));
  if (!shouldCompactRead({ filePath, text: '', tokens: estimatedTokens })) return null;
  return { filePath: path.resolve(filePath), estimatedTokens };
}

function writeDeny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      }
    })
  );
}

function denyForLargeGeneratedInput({ kind, detail, command }) {
  const length = command ? String(command).length : 0;
  const dataDir = getDataDir();
  const tokenlessRead = `node ${shellQuote(getTokenlessCliPath())} read --agent --data-dir ${shellQuote(dataDir)} '/path/to/file'`;
  writeDeny([
    'TOKENLESS-INPUT-GUARD/0.1',
    `Reason: generated ${kind} input is too large`,
    detail ? `Detail: ${detail}` : null,
    length ? `Input chars: ${length}` : null,
    'Use Tokenless tools and keep tool inputs small:',
    `1. ${tokenlessRead}`,
    '2. tokenless expand <artifact_id> --around "<target>" or --lines <start:end>',
    '3. Use small bounded Edit/MultiEdit calls on exact expanded lines.',
    'Do not create large heredoc/cat/node/python patch scripts unless the user explicitly asks.',
    'Blocked tool did not execute.'
  ].filter(Boolean).join('\n'));
}

function isLargeGeneratedBashInput(command) {
  const text = String(command || '');
  if (text.length < 3500) return null;

  const patterns = [
    { name: 'heredoc', re: /<<\s*['"]?[A-Za-z0-9_-]+/ },
    { name: 'cat-redirect-script', re: /\bcat\s*>\s*\S+/ },
    { name: 'tee-script', re: /\btee\s+\S+/ },
    { name: 'node-inline-script', re: /\bnode\s+-e\b/ },
    { name: 'python-inline-script', re: /\bpython3?\s+(?:-|<<|-c)\b/ },
    { name: 'write-file-script', re: /\b(writeFileSync|fs\.writeFile|open\([^)]*,\s*['"]w)/ }
  ];

  const hit = patterns.find((item) => item.re.test(text));
  return hit ? hit.name : null;
}

function isLargeGeneratedWriteInput(toolName, toolInput) {
  if (toolName !== 'Write') return null;
  const filePath = toolInput.file_path || toolInput.path || '';
  const content = typeof toolInput.content === 'string' ? toolInput.content : '';
  if (content.length < 3500) return null;

  const base = path.basename(String(filePath || '')).toLowerCase();
  const ext = path.extname(base);
  const scriptExts = new Set(['.js', '.mjs', '.cjs', '.py', '.sh', '.zsh', '.bash', '.rb', '.pl']);
  const looksLikePatchHelper = /(^_|patch|apply|fix|rewrite|premium|tmp|temp|script)/i.test(base);

  if (scriptExts.has(ext) && looksLikePatchHelper) {
    return `${base} (${content.length} chars)`;
  }
  return null;
}

function denyForReadGate(gate, context) {
  const stale = gate && gate.stale_packet;
  writeDeny([
    stale ? 'TOKENLESS-STALE/0.1' : 'TOKENLESS-GATE/0.1',
    stale ? 'Reason: file changed after read packet' : 'Reason: large file needs Tokenless read packet',
    `File: ${gate.file_path}`,
    `Estimated tokens: ${gate.estimated_tokens}`,
    stale && stale.artifact_id ? `Previous artifact: ${stale.artifact_id}` : null,
    stale && stale.reason ? `Stale reason: ${stale.reason}` : null,
    stale ? 'Blocked tool did not execute or change the file.' : null,
    `Next: ${gate.required_command}`,
    'Then expand only needed lines and use small bounded edits.',
    'Avoid large patch scripts, heredocs, or broad rewrites unless the user asks.',
    context ? `Context: ${context}` : ''
  ].filter(Boolean).join('\n'));
}

function stalePacketInfo(packetState) {
  if (!packetState || packetState.status !== 'stale') return null;
  return {
    artifact_id: packetState.entry && packetState.entry.artifact_id,
    created_at: packetState.entry && packetState.entry.created_at,
    previous_size: packetState.entry && packetState.entry.size,
    previous_mtime_ms: packetState.entry && packetState.entry.mtime_ms,
    current_size: packetState.current && packetState.current.size,
    current_mtime_ms: packetState.current && packetState.current.mtime_ms,
    reason: packetState.reason || 'stale'
  };
}

function setGateForCandidate({ dataDir, candidate, requiredCommand, reason, packetState }) {
  return setReadGate({
    dataDir,
    filePath: candidate.filePath,
    estimatedTokens: candidate.estimatedTokens,
    requiredCommand,
    reason,
    stalePacket: stalePacketInfo(packetState)
  });
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
  const dataDir = getDataDir();

  const largeWriteDetail = isLargeGeneratedWriteInput(toolName, toolInput);
  if (largeWriteDetail) {
    trace({ event: 'deny', reason: 'large-generated-write-input', tool: toolName, detail: largeWriteDetail });
    denyForLargeGeneratedInput({
      kind: toolName,
      detail: largeWriteDetail,
      command: toolInput.content || ''
    });
    return;
  }

  if (toolName === 'Read') {
    const filePath = toolInput.file_path || toolInput.path || '';
    if (!filePath || typeof filePath !== 'string') {
      trace({ event: 'skip', reason: 'read-empty-path' });
      process.exit(0);
    }

    const candidate = getLargeLowRiskReadCandidate(filePath);
    if (!candidate) {
      let estimatedTokens = 0;
      try {
        const stat = fs.statSync(filePath);
        estimatedTokens = Math.max(1, Math.ceil(stat.size / 4));
      } catch (err) {
        trace({ event: 'skip', reason: 'read-stat-failed', filePath, error: err.message });
        process.exit(0);
      }
      trace({ event: 'skip', reason: 'read-not-large-low-risk', filePath, estimatedTokens });
      process.exit(0);
    }

    const packetState = getReadPacketState(dataDir, candidate.filePath);
    if (packetState.status === 'valid') {
      trace({ event: 'skip', reason: 'read-packet-already-created', filePath: candidate.filePath });
      process.exit(0);
    }

    const rewritten = buildTokenlessReadCommand(candidate.filePath, dataDir);
    const gate = setGateForCandidate({
      dataDir,
      candidate,
      requiredCommand: rewritten,
      reason: packetState.status === 'stale' ? 'stale-read-packet-read-pretool' : 'large-read-pretool',
      packetState
    });

    trace({ event: packetState.status === 'stale' ? 'read-stale-cap' : 'read-cap', filePath: candidate.filePath, estimatedTokens: candidate.estimatedTokens, rewritten });

    denyForReadGate(gate, 'large Read was capped');
    return;
  }

  if (['Edit', 'MultiEdit', 'Write'].includes(toolName)) {
    const filePath = toolInput.file_path || toolInput.path || '';
    if (!filePath) {
      trace({ event: 'skip', reason: 'edit-like-empty-path', tool: toolName });
      process.exit(0);
    }

    const existingGate = getReadGate(dataDir, filePath);
    if (existingGate) {
      trace({ event: 'deny', reason: 'pending-read-gate-edit-like', tool: toolName, filePath });
      denyForReadGate(existingGate, `${toolName} attempted before Tokenless packet`);
      return;
    }

    const candidate = getLargeLowRiskReadCandidate(filePath);
    if (candidate) {
      const packetState = getReadPacketState(dataDir, candidate.filePath);
      if (packetState.status === 'valid') {
        trace({ event: 'skip', reason: 'edit-like-read-packet-exists', tool: toolName, filePath: candidate.filePath });
        process.exit(0);
      }

      const requiredCommand = buildTokenlessReadCommand(candidate.filePath, dataDir);
      const gate = setGateForCandidate({
        dataDir,
        candidate,
        requiredCommand,
        reason: packetState.status === 'stale' ? `${toolName}-stale-read-packet` : `${toolName}-large-file-before-tokenless-read`,
        packetState
      });
      trace({ event: 'deny', reason: packetState.status === 'stale' ? 'stale-read-packet-edit-like' : 'large-file-edit-like-before-tokenless-read', tool: toolName, filePath: candidate.filePath });
      denyForReadGate(gate, packetState.status === 'stale' ? `${toolName} attempted after the Tokenless packet became stale` : `${toolName} attempted on large file before Tokenless packet`);
      return;
    }

    trace({ event: 'skip', reason: 'edit-like-no-gate', tool: toolName, filePath });
    process.exit(0);
  }

  if (toolName !== 'Bash') {
    trace({ event: 'skip', reason: 'not-bash-or-read', tool: toolName });
    process.exit(0);
  }

  const command = toolInput.command || '';

  if (!command || typeof command !== 'string') {
    trace({ event: 'skip', reason: 'empty-command' });
    process.exit(0);
  }

  if (isTokenlessCommand(command)) {
    trace({ event: 'skip', reason: 'tokenless-recursion', command });
    process.exit(0);
  }

  const largeBashDetail = isLargeGeneratedBashInput(command);
  if (largeBashDetail) {
    trace({ event: 'deny', reason: 'large-generated-bash-input', command, detail: largeBashDetail });
    denyForLargeGeneratedInput({
      kind: 'Bash',
      detail: largeBashDetail,
      command
    });
    return;
  }

  const pendingGate = findGateForCommand(dataDir, command);
  if (pendingGate && isLikelyFileAccessCommand(command)) {
    trace({ event: 'deny', reason: 'pending-read-gate-bash', command, filePath: pendingGate.file_path });
    denyForReadGate(pendingGate, 'Bash file access attempted before Tokenless packet');
    return;
  }

  if (isLikelyFileAccessCommand(command)) {
    const candidates = extractFilePathCandidates(command)
      .map((filePath) => getLargeLowRiskReadCandidate(filePath))
      .filter(Boolean);

    if (candidates.length) {
      const candidate = candidates[0];
      const packetState = getReadPacketState(dataDir, candidate.filePath);
      if (packetState.status === 'valid') {
        trace({ event: 'skip', reason: 'bash-read-packet-exists', command, filePath: candidate.filePath });
        process.exit(0);
      }

      const requiredCommand = buildTokenlessReadCommand(candidate.filePath, dataDir);
      const gate = setGateForCandidate({
        dataDir,
        candidate,
        requiredCommand,
        reason: packetState.status === 'stale' ? 'bash-stale-read-packet' : 'bash-large-file-access-before-tokenless-read',
        packetState
      });
      trace({ event: 'deny', reason: packetState.status === 'stale' ? 'stale-read-packet-bash' : 'large-file-bash-before-tokenless-read', command, filePath: candidate.filePath });
      denyForReadGate(gate, packetState.status === 'stale' ? 'Bash file access attempted after the Tokenless packet became stale' : 'Bash file access on large file before Tokenless packet');
      return;
    }
  }

  if (!isNoisyCommand(command)) {
    trace({ event: 'skip', reason: 'not-noisy', command });
    process.exit(0);
  }

  const tokenlessCliPath = getTokenlessCliPath();
  const encodedCommand = Buffer.from(command, 'utf8').toString('base64');
  const rewritten = `node ${shellQuote(tokenlessCliPath)} run --agent --data-dir ${shellQuote(dataDir)} --cmd-b64 ${shellQuote(encodedCommand)}`;

  const updatedInput = {
    ...toolInput,
    command: rewritten,
    description: toolInput.description
      ? `${toolInput.description} (compressed by Tokenless)`
      : `Run compressed command: ${command}`
  };

  const permissionDecision = getPermissionDecision();

  trace({ event: 'rewrite', mode: permissionDecision, command, rewritten });

  if (permissionDecision === 'deny') {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: [
            'Tokenless is capping this noisy Bash output before it enters model context.',
            'Run the compacted command instead:',
            rewritten
          ].join('\n')
        }
      })
    );
    return;
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason: 'Tokenless rewrote noisy Bash command through local compression. Approve the rewritten command to keep raw output out of model context.',
        updatedInput
      }
    })
  );
}

main();
