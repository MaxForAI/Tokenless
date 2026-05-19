'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_STYLES = ['off', 'chat', 'coding'];

const STYLE_ALIASES = {
  normal: 'off',
  none: 'off',
  disable: 'off',
  disabled: 'off',
  stop: 'off',
  default: 'chat',
  chat: 'chat',
  talk: 'chat',
  daily: 'chat',
  brief: 'chat',
  lean: 'chat',
  terse: 'chat',
  short: 'chat',
  compact: 'chat',
  balanced: 'chat',
  minimal: 'chat',
  efficient: 'chat',
  silent: 'chat',
  max: 'chat',
  maximum: 'chat',
  extreme: 'chat',
  quiet: 'chat',
  minimalism: 'chat',
  coding: 'coding',
  code: 'coding',
  fast: 'coding',
  dense: 'coding',
  d1: 'coding',
  dense2: 'coding',
  d2: 'coding',
  v2: 'coding',
  cipher: 'coding',
  codebook: 'coding',
  wire: 'coding',
  protocol: 'coding',
  codec: 'coding',
  tlw: 'coding',
  tlw1: 'coding',
  codec2: 'coding'
};

const MAX_STYLE_CONFIG_BYTES = 4096;

function defaultDataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.tokenless');
}

function normalizeStyle(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (STYLE_ALIASES[raw]) return STYLE_ALIASES[raw];
  if (VALID_STYLES.includes(raw)) return raw;
  return null;
}

function getStylePath(dataDir = defaultDataDir()) {
  return path.join(dataDir || defaultDataDir(), 'style.json');
}

function readSmallFileNoSymlink(filePath) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (err) {
    return null;
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_STYLE_CONFIG_BYTES) {
    return null;
  }

  const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  let fd;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | O_NOFOLLOW);
    const buffer = Buffer.alloc(Math.min(MAX_STYLE_CONFIG_BYTES, stat.size || MAX_STYLE_CONFIG_BYTES));
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.slice(0, bytes).toString('utf8');
  } catch (err) {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function readStyleConfig(dataDir = defaultDataDir()) {
  const pathForStyle = getStylePath(dataDir);
  const envStyle = normalizeStyle(process.env.TOKENLESS_STYLE || '');
  if (envStyle) {
    return {
      style: envStyle,
      source: 'TOKENLESS_STYLE',
      path: pathForStyle,
      updated_at: null
    };
  }

  const raw = readSmallFileNoSymlink(pathForStyle);
  if (!raw) {
    return {
      style: 'chat',
      source: 'default',
      path: pathForStyle,
      updated_at: null
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const style = normalizeStyle(parsed.style || parsed.mode || '');
    if (!style) throw new Error('invalid style');
    return {
      style,
      source: 'config',
      path: pathForStyle,
      updated_at: parsed.updated_at || null
    };
  } catch (err) {
    return {
      style: 'chat',
      source: 'invalid-config',
      path: pathForStyle,
      updated_at: null
    };
  }
}

function writeStyleConfig({ dataDir = defaultDataDir(), style }) {
  const normalized = normalizeStyle(style);
  if (!normalized) {
    throw new Error(`invalid style: ${style}`);
  }

  const targetPath = getStylePath(dataDir);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`refusing to write symlink: ${targetPath}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const payload = {
    version: 1,
    style: normalized,
    updated_at: new Date().toISOString()
  };
  const tempPath = path.join(path.dirname(targetPath), `.style.${process.pid}.${Date.now()}.json`);
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(tempPath, 0o600);
  } catch (err) {
    // Best effort on platforms without chmod semantics.
  }
  fs.renameSync(tempPath, targetPath);

  return {
    style: normalized,
    path: targetPath,
    updated_at: payload.updated_at
  };
}

function formatStyleContext(style) {
  const normalized = normalizeStyle(style);
  if (!normalized || normalized === 'off') return '';

  const shared = 'Use normal clarity for security warnings, irreversible actions, high-stakes advice, and ambiguous multi-step instructions. Code blocks, commands, commit messages, and exact errors stay normal.';

  if (normalized === 'chat') {
    return `TOKENLESS STYLE ACTIVE (chat). Minimize output tokens while staying human-readable. Answer directly. No greetings, no request recap, no process narration, no generic summary, no optional next-step questions unless clearly needed. Prefer one short paragraph or max 3 short bullets. For coding tasks, report only changed files, validation done/not done, and concrete risk. Expand only when user asks. ${shared}`;
  }

  if (normalized === 'coding') {
    return 'TOKENLESS STYLE ACTIVE (coding). Use Tokenless Dense Protocol D2 for coding workflows. Goal: min output tokens + low latency, not comfortable prose. No Markdown, no legend, no abbreviation expansion. Emit one ASCII line when possible. Forms: D2a <core>;!<avoid>;?<cond>. D2e <chg>|<val>|<risk>|<next>. D2r <risk>|<fix>|<edge>. D2p <s1>;<s2>;<s3>. D2b <why>|<next>. Omit default fields: none/pass/no-risk/no-next. Use compact ASCII only: ->,!,?,+,/,=. Preserve code/API names exactly. Prefer abbrev: exp,calc,ref,stab,dep,chg,val,nx,rej,sig,skew,ctx,req,res,err. If safety/high-stakes/irreversible ambiguity, temporarily use concise normal text.';
  }

  return '';
}

module.exports = {
  VALID_STYLES,
  defaultDataDir,
  normalizeStyle,
  getStylePath,
  readStyleConfig,
  writeStyleConfig,
  formatStyleContext
};
