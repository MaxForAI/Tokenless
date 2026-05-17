'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureArtifactDir(dataDir) {
  const base = path.resolve(dataDir || path.join(process.cwd(), '.tokenless'));
  const artifactRoot = path.join(base, 'artifacts');
  fs.mkdirSync(artifactRoot, { recursive: true });
  return artifactRoot;
}

function ensureDataDir(dataDir) {
  const base = path.resolve(dataDir || path.join(process.cwd(), '.tokenless'));
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value || '', 'utf8').digest('hex');
}

function formatArtifactId() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = p(now.getMonth() + 1);
  const d = p(now.getDate());
  const h = p(now.getHours());
  const mm = p(now.getMinutes());
  const s = p(now.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6);
  return `ctx_${y}${m}${d}_${h}${mm}${s}_${rand}`;
}

function normalizeStatsSource(source) {
  const normalized = String(source || '').trim().toLowerCase();
  if (normalized === 'hook' || normalized === 'eval' || normalized === 'smoke') {
    return normalized;
  }
  if (normalized === 'manual' || normalized === 'doctor' || normalized === 'test') {
    return 'smoke';
  }
  if (normalized === 'legacy') {
    return 'legacy';
  }
  return 'unknown';
}

function createArtifact({ dataDir, artifactId: providedArtifactId, command, exitCode, reducer, stdout = '', stderr = '', compactedText = '', beforeTokens = 0, afterTokens = 0, status, source }) {
  const artifactRoot = ensureArtifactDir(dataDir);
  const base = path.dirname(artifactRoot);
  const artifactId = providedArtifactId || formatArtifactId();
  const artifactDir = path.join(artifactRoot, artifactId);
  fs.mkdirSync(artifactDir, { recursive: true });

  const createdAt = new Date().toISOString();
  const normalizedBeforeTokens = Number(beforeTokens) || 0;
  const normalizedAfterTokens = Number(afterTokens) || 0;
  const meta = {
    artifact_id: artifactId,
    created_at: createdAt,
    cwd: process.cwd(),
    command,
    exit_code: exitCode,
    status: status || (exitCode === 0 ? 'success' : 'failed'),
    bytes_stdout: Buffer.byteLength(stdout || ''),
    bytes_stderr: Buffer.byteLength(stderr || ''),
    sha256_stdout: sha256(stdout || ''),
    sha256_stderr: sha256(stderr || ''),
    reducer,
    source: normalizeStatsSource(source || process.env.TOKENLESS_STATS_SOURCE || 'unknown'),
    beforeTokens: normalizedBeforeTokens,
    afterTokens: normalizedAfterTokens,
    tokens_before: normalizedBeforeTokens,
    tokens_after: normalizedAfterTokens,
    tokens_saved: normalizedBeforeTokens - normalizedAfterTokens
  };

  fs.writeFileSync(path.join(artifactDir, 'raw.stdout'), stdout, 'utf8');
  fs.writeFileSync(path.join(artifactDir, 'raw.stderr'), stderr, 'utf8');
  fs.writeFileSync(path.join(artifactDir, 'compacted.txt'), compactedText, 'utf8');
  fs.writeFileSync(path.join(artifactDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  appendStatsEntry(base, meta);

  return meta;
}

function createArtifactFromFallback(params) {
  return createArtifact(params);
}

function readArtifact(dataDir, artifactId) {
  const artifactRoot = ensureArtifactDir(dataDir);
  const artifactDir = path.join(artifactRoot, artifactId);
  const metaPath = path.join(artifactDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const stdout = fs.readFileSync(path.join(artifactDir, 'raw.stdout'), 'utf8');
  const stderr = fs.readFileSync(path.join(artifactDir, 'raw.stderr'), 'utf8');

  return { meta, stdout, stderr };
}

function listArtifacts(dataDir) {
  const artifactRoot = ensureArtifactDir(dataDir);
  const entries = fs.readdirSync(artifactRoot, { withFileTypes: true });
  const artifacts = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(artifactRoot, entry.name, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      artifacts.push(meta);
    } catch (err) {
      artifacts.push({
        artifact_id: entry.name,
        created_at: 'unknown',
        status: 'unknown',
        reducer: 'unknown',
        command: `(unreadable meta: ${err.message})`
      });
    }
  }

  return artifacts.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function appendStatsEntry(baseDir, meta) {
  const entry = {
    at: meta.created_at,
    artifact_id: meta.artifact_id,
    cwd: meta.cwd,
    command: meta.command,
    status: meta.status,
    exit_code: meta.exit_code,
    reducer: meta.reducer,
    source: normalizeStatsSource(meta.source || 'legacy'),
    tokens_before: meta.tokens_before || meta.beforeTokens || 0,
    tokens_after: meta.tokens_after || meta.afterTokens || 0,
    tokens_saved: meta.tokens_saved || ((meta.tokens_before || meta.beforeTokens || 0) - (meta.tokens_after || meta.afterTokens || 0)),
    bytes_stdout: meta.bytes_stdout || 0,
    bytes_stderr: meta.bytes_stderr || 0
  };

  fs.mkdirSync(baseDir, { recursive: true });
  fs.appendFileSync(path.join(baseDir, 'stats.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
}

function readStatsEntries(dataDir) {
  const base = ensureDataDir(dataDir);
  const statsPath = path.join(base, 'stats.jsonl');
  const entries = [];
  const seen = new Set();

  if (fs.existsSync(statsPath)) {
    const lines = fs.readFileSync(statsPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const entry of lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    }).filter(Boolean)) {
      entries.push(entry);
      if (entry.artifact_id) seen.add(entry.artifact_id);
    }
  }

  for (const meta of listArtifacts(dataDir)) {
    if (seen.has(meta.artifact_id)) continue;
    entries.push({
      at: meta.created_at,
      artifact_id: meta.artifact_id,
      cwd: meta.cwd,
      command: meta.command,
      status: meta.status,
      exit_code: meta.exit_code,
      reducer: meta.reducer,
      source: normalizeStatsSource(meta.source || 'legacy'),
      tokens_before: meta.tokens_before || meta.beforeTokens || 0,
      tokens_after: meta.tokens_after || meta.afterTokens || 0,
      tokens_saved: meta.tokens_saved || ((meta.tokens_before || meta.beforeTokens || 0) - (meta.tokens_after || meta.afterTokens || 0)),
      bytes_stdout: meta.bytes_stdout || 0,
      bytes_stderr: meta.bytes_stderr || 0
    });
  }

  return entries.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

function summarizeStats(entries) {
  const summary = {
    calls: entries.length,
    success: 0,
    failed: 0,
    tokens_before: 0,
    tokens_after: 0,
    tokens_saved: 0,
    bytes_stdout: 0,
    bytes_stderr: 0,
    by_reducer: {},
    by_source: {}
  };

  for (const entry of entries) {
    const before = Number(entry.tokens_before) || 0;
    const after = Number(entry.tokens_after) || 0;
    const saved = Number(entry.tokens_saved) || (before - after);
    const reducer = entry.reducer || 'unknown';
    const source = normalizeStatsSource(entry.source || 'legacy');

    if (entry.status === 'success') summary.success += 1;
    if (entry.status === 'failed') summary.failed += 1;
    summary.tokens_before += before;
    summary.tokens_after += after;
    summary.tokens_saved += saved;
    summary.bytes_stdout += Number(entry.bytes_stdout) || 0;
    summary.bytes_stderr += Number(entry.bytes_stderr) || 0;

    if (!summary.by_reducer[reducer]) {
      summary.by_reducer[reducer] = {
        calls: 0,
        tokens_before: 0,
        tokens_after: 0,
        tokens_saved: 0
      };
    }

    summary.by_reducer[reducer].calls += 1;
    summary.by_reducer[reducer].tokens_before += before;
    summary.by_reducer[reducer].tokens_after += after;
    summary.by_reducer[reducer].tokens_saved += saved;

    if (!summary.by_source[source]) {
      summary.by_source[source] = {
        calls: 0,
        tokens_before: 0,
        tokens_after: 0,
        tokens_saved: 0
      };
    }

    summary.by_source[source].calls += 1;
    summary.by_source[source].tokens_before += before;
    summary.by_source[source].tokens_after += after;
    summary.by_source[source].tokens_saved += saved;
  }

  return summary;
}

function readObservationEntries(dataDir) {
  const base = ensureDataDir(dataDir);
  const observedPath = path.join(base, 'observed.jsonl');
  if (!fs.existsSync(observedPath)) return [];

  return fs.readFileSync(observedPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
}

function summarizeObservations(entries) {
  const summary = {
    calls: entries.length,
    large_outputs: 0,
    max_response_tokens: 0,
    max_total_tokens: 0,
    by_tool: {}
  };

  for (const entry of entries) {
    const tool = entry.tool_name || 'unknown';
    const responseTokens = Number(entry.response_tokens) || 0;
    const totalTokens = Number(entry.total_tokens) || 0;

    if (entry.large_output) summary.large_outputs += 1;
    summary.max_response_tokens = Math.max(summary.max_response_tokens, responseTokens);
    summary.max_total_tokens = Math.max(summary.max_total_tokens, totalTokens);

    if (!summary.by_tool[tool]) {
      summary.by_tool[tool] = {
        calls: 0,
        large_outputs: 0,
        response_tokens: 0,
        total_tokens: 0,
        max_response_tokens: 0
      };
    }

    summary.by_tool[tool].calls += 1;
    if (entry.large_output) summary.by_tool[tool].large_outputs += 1;
    summary.by_tool[tool].response_tokens += responseTokens;
    summary.by_tool[tool].total_tokens += totalTokens;
    summary.by_tool[tool].max_response_tokens = Math.max(summary.by_tool[tool].max_response_tokens, responseTokens);
  }

  return summary;
}

function expandArtifactAround(artifact, keyword) {
  const raw = `${artifact.stdout}\n${artifact.stderr}`.split(/\r?\n/);
  const lines = raw;
  const matches = [];

  const target = String(keyword || '').trim();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(target)) {
      matches.push(i);
      if (matches.length >= 20) {
        break;
      }
    }
  }

  if (matches.length === 0) {
    return '';
  }

  const out = [];
  const seen = new Set();

  for (const index of matches) {
    const start = Math.max(0, index - 50);
    const end = Math.min(lines.length - 1, index + 50);

    for (let i = start; i <= end; i++) {
      const key = String(i);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${i + 1}: ${lines[i]}`);
    }
    out.push(`--- around ${keyword} at line ${index + 1} ---`);
  }

  return out.join('\n');
}

function expandArtifactLines(artifact, range) {
  const match = String(range || '').trim().match(/^(\d+)(?::|-)(\d+)$/);
  if (!match) return '';

  const startLine = Math.max(1, Number(match[1]) || 1);
  const endLine = Math.max(startLine, Number(match[2]) || startLine);
  const raw = `${artifact.stdout}\n${artifact.stderr}`.split(/\r?\n/);
  const start = Math.max(0, startLine - 1);
  const end = Math.min(raw.length - 1, endLine - 1);
  const out = [];

  for (let i = start; i <= end; i++) {
    out.push(`${i + 1}: ${raw[i]}`);
  }

  return out.join('\n');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function formatArtifactPointer(artifactId, options = {}) {
  if (options.accPath && options.dataDir) {
    return `node ${shellQuote(options.accPath)} show ${artifactId} --data-dir ${shellQuote(options.dataDir)}`;
  }
  return `tokenless show ${artifactId}`;
}

module.exports = {
  ensureArtifactDir,
  ensureDataDir,
  formatArtifactId,
  createArtifact,
  createArtifactFromFallback: createArtifactFromFallback,
  normalizeStatsSource,
  readArtifact,
  listArtifacts,
  readStatsEntries,
  summarizeStats,
  readObservationEntries,
  summarizeObservations,
  expandArtifactAround,
  expandArtifactLines,
  formatArtifactPointer
};
