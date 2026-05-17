'use strict';

const fs = require('fs');
const path = require('path');

function ensureDataDir(dataDir) {
  const base = path.resolve(dataDir || path.join(process.cwd(), '.tokenless'));
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function normalizeFilePath(filePath) {
  if (!filePath) return '';
  return path.resolve(String(filePath));
}

function getGatePath(dataDir) {
  return path.join(ensureDataDir(dataDir), 'pending_read_gates.json');
}

function getPacketIndexPath(dataDir) {
  return path.join(ensureDataDir(dataDir), 'read_packet_index.json');
}

const DEFAULT_EDIT_LEASE_MAX_EDITS = 8;
const DEFAULT_EDIT_LEASE_MAX_AGE_MS = 30 * 60 * 1000;

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value || {}, null, 2), 'utf8');
}

function readGates(dataDir) {
  return readJsonFile(getGatePath(dataDir));
}

function writeGates(dataDir, gates) {
  writeJsonFile(getGatePath(dataDir), gates);
}

function setReadGate({ dataDir, filePath, estimatedTokens, requiredCommand, reason, stalePacket }) {
  const normalized = normalizeFilePath(filePath);
  if (!normalized) return null;

  const gates = readGates(dataDir);
  gates[normalized] = {
    file_path: normalized,
    created_at: new Date().toISOString(),
    estimated_tokens: Number(estimatedTokens) || 0,
    required_command: requiredCommand,
    reason: reason || 'large-read-requires-tokenless-packet',
    stale_packet: stalePacket || null
  };
  writeGates(dataDir, gates);
  return gates[normalized];
}

function clearReadGate({ dataDir, filePath }) {
  const normalized = normalizeFilePath(filePath);
  if (!normalized) return false;

  const gates = readGates(dataDir);
  const existed = Boolean(gates[normalized]);
  if (existed) {
    delete gates[normalized];
    writeGates(dataDir, gates);
  }
  return existed;
}

function getReadGate(dataDir, filePath) {
  const normalized = normalizeFilePath(filePath);
  if (!normalized) return null;
  return readGates(dataDir)[normalized] || null;
}

function listReadGates(dataDir) {
  return Object.values(readGates(dataDir));
}

function readPacketIndex(dataDir) {
  return readJsonFile(getPacketIndexPath(dataDir));
}

function listReadPackets(dataDir) {
  return Object.values(readPacketIndex(dataDir));
}

function writePacketIndex(dataDir, index) {
  writeJsonFile(getPacketIndexPath(dataDir), index);
}

function getFileStamp(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return {
      size: stat.size,
      mtime_ms: Math.floor(stat.mtimeMs)
    };
  } catch (err) {
    return null;
  }
}

function markReadPacket({ dataDir, filePath, artifactId, estimatedTokens }) {
  const normalized = normalizeFilePath(filePath);
  if (!normalized) return null;

  const stamp = getFileStamp(normalized);
  const index = readPacketIndex(dataDir);
  index[normalized] = {
    file_path: normalized,
    artifact_id: artifactId || null,
    created_at: new Date().toISOString(),
    estimated_tokens: Number(estimatedTokens) || 0,
    size: stamp ? stamp.size : null,
    mtime_ms: stamp ? stamp.mtime_ms : null,
    edit_lease: stamp ? {
      edits: 0,
      max_edits: DEFAULT_EDIT_LEASE_MAX_EDITS,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } : null
  };
  writePacketIndex(dataDir, index);
  return index[normalized];
}

function refreshReadPacketAfterSmallEdit({ dataDir, filePath, toolName }) {
  const normalized = normalizeFilePath(filePath);
  if (!normalized) return { updated: false, reason: 'empty-path' };
  if (!['Edit', 'MultiEdit'].includes(toolName)) return { updated: false, reason: 'tool-not-eligible' };

  const index = readPacketIndex(dataDir);
  const entry = index[normalized] || null;
  if (!entry) return { updated: false, reason: 'missing-packet' };

  const stamp = getFileStamp(normalized);
  if (!stamp) return { updated: false, reason: 'file-unavailable' };

  const lease = entry.edit_lease || {};
  const edits = Number(lease.edits) || 0;
  const maxEdits = Number(lease.max_edits) || DEFAULT_EDIT_LEASE_MAX_EDITS;
  if (edits >= maxEdits) return { updated: false, reason: 'edit-lease-exhausted', edits, max_edits: maxEdits };

  index[normalized] = {
    ...entry,
    size: stamp.size,
    mtime_ms: stamp.mtime_ms,
    edit_lease: {
      ...lease,
      edits: edits + 1,
      max_edits: maxEdits,
      created_at: lease.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  };
  writePacketIndex(dataDir, index);
  return { updated: true, edits: edits + 1, max_edits: maxEdits };
}

function getReadPacket(dataDir, filePath) {
  const state = getReadPacketState(dataDir, filePath);
  return state.status === 'valid' ? state.entry : null;
}

function getReadPacketState(dataDir, filePath) {
  const normalized = normalizeFilePath(filePath);
  if (!normalized) return { status: 'missing', entry: null, current: null };

  const entry = readPacketIndex(dataDir)[normalized] || null;
  if (!entry) return { status: 'missing', entry: null, current: getFileStamp(normalized) };

  const stamp = getFileStamp(normalized);
  if (!stamp) return { status: 'stale', reason: 'file-unavailable', entry, current: null };
  const lease = entry.edit_lease || null;
  if (lease) {
    const edits = Number(lease.edits) || 0;
    const maxEdits = Number(lease.max_edits) || DEFAULT_EDIT_LEASE_MAX_EDITS;
    const updatedAt = lease.updated_at ? Date.parse(lease.updated_at) : NaN;
    if (edits >= maxEdits) return { status: 'stale', reason: 'edit-lease-exhausted', entry, current: stamp };
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt > DEFAULT_EDIT_LEASE_MAX_AGE_MS) {
      return { status: 'stale', reason: 'edit-lease-expired', entry, current: stamp };
    }
  }
  if (entry.size !== stamp.size || entry.mtime_ms !== stamp.mtime_ms) {
    return { status: 'stale', reason: 'file-changed', entry, current: stamp };
  }
  return { status: 'valid', entry, current: stamp };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function commandReferencesFile(command, filePath) {
  const normalized = normalizeFilePath(filePath);
  const text = String(command || '');
  if (!normalized || !text) return false;
  return text.includes(normalized) || text.includes(shellQuote(normalized)) || text.includes(`"${normalized}"`);
}

function findGateForCommand(dataDir, command) {
  return listReadGates(dataDir).find((gate) => commandReferencesFile(command, gate.file_path)) || null;
}

function tokenizeCommand(command) {
  const tokens = [];
  const regex = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let match;
  while ((match = regex.exec(String(command || ''))) !== null) {
    tokens.push(match[1] || match[2] || match[3] || '');
  }
  return tokens;
}

function extractFilePathCandidates(command) {
  return tokenizeCommand(command)
    .map((token) => token.replace(/^[<>()]+|[<>()]+$/g, '').replace(/:\d+(?::\d+)?$/, ''))
    .filter((token) => token.startsWith('/') || token.startsWith('./') || token.startsWith('../'))
    .map((token) => normalizeFilePath(token));
}

function isLikelyFileAccessCommand(command) {
  const tokens = tokenizeCommand(command);
  const first = path.basename(tokens[0] || '');
  return [
    'cat',
    'grep',
    'rg',
    'sed',
    'head',
    'tail',
    'awk',
    'perl',
    'wc',
    'less',
    'more',
    'bat'
  ].includes(first);
}

module.exports = {
  setReadGate,
  clearReadGate,
  getReadGate,
  listReadGates,
  markReadPacket,
  refreshReadPacketAfterSmallEdit,
  getReadPacket,
  getReadPacketState,
  listReadPackets,
  findGateForCommand,
  extractFilePathCandidates,
  isLikelyFileAccessCommand,
  normalizeFilePath
};
