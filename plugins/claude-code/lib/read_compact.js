'use strict';

const path = require('path');
const { estimateTokens } = require('./compact');

const LOW_RISK_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.svg',
  '.json',
  '.jsonl',
  '.log',
  '.txt',
  '.md',
  '.lock',
  '.yaml',
  '.yml'
]);

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.rb',
  '.php',
  '.swift',
  '.kt',
  '.cs'
]);

function getFileExtension(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase();
  if (base === 'package-lock.json' || base === 'pnpm-lock.yaml' || base === 'yarn.lock') return '.lock';
  return path.extname(base);
}

function isGeneratedPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return /(^|\/)(dist|build|coverage|node_modules|\.next|generated|vendor)\//.test(normalized) ||
    /\.min\.(js|css)$/.test(normalized) ||
    /lock\.(json|yaml|yml)$/.test(normalized);
}

function shouldCompactRead({ filePath, text, tokens }) {
  const ext = getFileExtension(filePath);
  if (tokens < 4000) return false;
  if (isGeneratedPath(filePath)) return true;
  if (LOW_RISK_EXTENSIONS.has(ext)) return true;
  if (SOURCE_EXTENSIONS.has(ext)) return tokens >= 12000 && false;
  return tokens >= 12000;
}

function collectAnchors(lines, filePath) {
  const ext = getFileExtension(filePath);
  const anchors = [];
  const maxAnchors = 20000;

  const patterns = [];
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    patterns.push({
      type: 'selector',
      regex: /^\s*([.#][A-Za-z0-9_-][^{,]*(?:,[^{]+)?|\w[\w-]*(?:\s+[.#\w][^{]*)?)\s*\{/
    });
    patterns.push({ type: 'media', regex: /^\s*@(?:media|keyframes|supports|font-face)\b[^{]*/ });
    patterns.push({ type: 'variables', regex: /^\s*:root\s*\{/ });
  } else if (['.html', '.htm', '.svg'].includes(ext)) {
    patterns.push({ type: 'heading', regex: /^\s*<h[1-6]\b[^>]*>/i });
    patterns.push({ type: 'section', regex: /^\s*<(section|main|header|footer|nav|article|div)\b[^>]*(?:id|class)=["'][^"']+["']/i });
    patterns.push({ type: 'script-style', regex: /^\s*<(script|style)\b/i });
  } else if (['.json', '.jsonl'].includes(ext)) {
    patterns.push({ type: 'json-key', regex: /^\s*"([^"]+)":/ });
  } else if (['.md', '.txt', '.log'].includes(ext)) {
    patterns.push({ type: 'heading', regex: /^\s{0,3}#{1,6}\s+.+/ });
    patterns.push({ type: 'error', regex: /error|failed|exception|warning/i });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;
      anchors.push({
        line: i + 1,
        type: pattern.type,
        text: line.trim().slice(0, 140)
      });
      break;
    }
    if (anchors.length >= maxAnchors) break;
  }

  return anchors;
}

function selectVisibleAnchors(anchors) {
  const selected = [];
  const seen = new Set();

  function add(item) {
    if (!item || seen.has(item.line)) return;
    selected.push(item);
    seen.add(item.line);
  }

  anchors.slice(0, 30).forEach(add);
  anchors
    .filter((item) => /tokenless|probe|target/i.test(item.text))
    .slice(0, 20)
    .forEach(add);
  anchors.slice(-15).forEach(add);
  anchors
    .filter((item) => /card|error|warning|fail/i.test(item.text))
    .slice(0, 15)
    .forEach(add);

  return selected.slice(0, 60).sort((a, b) => a.line - b.line);
}

function truncateText(text, max = 140) {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function takeWithOmitted(items, max) {
  return {
    visible: items.slice(0, max),
    omitted: Math.max(0, items.length - max)
  };
}

function formatOmitted(label, count) {
  return count > 0 ? `- ${label} omitted: ${count}` : null;
}

function extractCssVariables(lines) {
  const out = [];
  const seen = new Set();
  const variableRe = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);?/g;

  for (let i = 0; i < lines.length; i++) {
    let match;
    while ((match = variableRe.exec(lines[i])) !== null) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({
        line: i + 1,
        text: `${name}: ${truncateText(match[2], 80)}`
      });
    }
  }

  return out;
}

function extractCssColors(lines) {
  const colors = new Map();
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{1,80}\)|hsla?\([^)]{1,80}\)/g;

  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(colorRe) || [];
    for (const raw of matches) {
      const color = raw.replace(/\s+/g, ' ');
      if (!colors.has(color)) {
        colors.set(color, { color, firstLine: i + 1, count: 0 });
      }
      colors.get(color).count += 1;
    }
  }

  return Array.from(colors.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.firstLine - b.firstLine;
  });
}

const CSS_EDITABLE_SELECTOR_RE = /\b(card|button|btn|nav|header|footer|hero|modal|dialog|form|input|sidebar|layout|container|grid|panel|tab|menu|dropdown|toast|alert|badge|quote|timeline|section|toolbar|label|field|search|filter)\b/i;
const CSS_VISUAL_PROPERTY_RE = /\b(background|border|box-shadow|color|gradient|transform|transition|animation|filter|backdrop-filter|opacity|radius|padding|margin|display|grid|flex|position|font|letter-spacing|line-height)\s*:/i;
const CSS_LOW_VALUE_SELECTOR_RE = /\.(?:filler|fixture|generated|utility|util|tw-|css-|hash|chunk|unused|dummy|placeholder|skeleton)[A-Za-z0-9_-]*/i;
const CSS_HASHY_SELECTOR_RE = /\.[A-Za-z0-9_-]*[a-f0-9]{8,}[A-Za-z0-9_-]*/i;
const CSS_KEY_VARIABLE_RE = /--(?:bg|background|surface|text|muted|faint|primary|secondary|accent|cyan|orange|blue|red|border|radius|shadow|glass|font|spacing|transition|ease|color)/i;

function extractCssLikelySelectors(anchors) {
  const primary = anchors.filter((item) => {
    return item.type === 'selector' && (
      CSS_EDITABLE_SELECTOR_RE.test(item.text) ||
      /^(:root|body|html)\b/i.test(item.text)
    );
  });

  if (primary.length) return primary;
  return anchors.filter((item) => item.type === 'selector');
}

function extractCssAtRules(lines) {
  const out = [];
  const re = /^\s*@(media|keyframes|supports|font-face)\b[^{;]*/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(re);
    if (match) out.push({ line: i + 1, text: truncateText(lines[i]) });
  }
  return out;
}

function classifyCssComponent(selector) {
  const text = String(selector || '').toLowerCase();
  if (/^(:root|html|body)\b/.test(text)) return 'theme/base';
  if (/\b(nav|navbar|header|sidebar|menu)\b/.test(text)) return 'nav/header';
  if (/\b(hero|banner|masthead|jumbotron)\b/.test(text)) return 'hero';
  if (/\b(button|btn|cta|action)\b/.test(text)) return 'buttons/actions';
  if (/\b(card|panel|tile|quote|stat|feature|lab)\b/.test(text)) return 'cards/panels';
  if (/\b(form|input|field|label|select|textarea|search|filter)\b/.test(text)) return 'forms/inputs';
  if (/\b(modal|dialog|toast|alert|popover|dropdown|tab)\b/.test(text)) return 'feedback/overlays';
  if (/\b(table|list|grid|row|item)\b/.test(text)) return 'lists/grids';
  if (/\b(footer)\b/.test(text)) return 'footer';
  if (/\b(orbit|portrait|visual|media|image|avatar|icon|chip|badge)\b/.test(text)) return 'visual/details';
  if (/\b(container|section|layout|content|main)\b/.test(text)) return 'layout/sections';
  return null;
}

function getCssRuleBlocks(lines) {
  const blocks = [];
  let current = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;

    if (!current && opens > 0 && !trimmed.startsWith('@')) {
      current = {
        start: i + 1,
        selector: truncateText(trimmed.replace(/\s*\{\s*$/, ''), 120),
        visualProps: 0,
        lowValueScore: 0,
        editableScore: 0,
        lines: 0
      };
      if (/^(:root|body|html)\b/i.test(current.selector)) current.editableScore += 3;
      if (CSS_EDITABLE_SELECTOR_RE.test(current.selector)) current.editableScore += 2;
      if (CSS_LOW_VALUE_SELECTOR_RE.test(current.selector)) current.lowValueScore += 3;
      if (CSS_HASHY_SELECTOR_RE.test(current.selector)) current.lowValueScore += 2;
      if (/\\.filler-rule-\\d+/i.test(current.selector)) current.lowValueScore += 4;
    }

    if (current) {
      current.lines += 1;
      if (CSS_VISUAL_PROPERTY_RE.test(raw)) current.visualProps += 1;
    }

    depth += opens - closes;
    if (current && depth <= 0 && closes > 0) {
      current.end = i + 1;
      current.editableScore += Math.min(4, current.visualProps);
      blocks.push(current);
      current = null;
      depth = 0;
    }
  }

  return blocks;
}

function mergeCssRegions(blocks, predicate, maxGap = 12) {
  const regions = [];
  for (const block of blocks) {
    if (!predicate(block)) continue;
    const last = regions[regions.length - 1];
    if (last && block.start - last.end <= maxGap) {
      last.end = block.end;
      last.blocks += 1;
      last.visualProps += block.visualProps;
      last.score += block.editableScore;
      last.selectors.push(block.selector);
    } else {
      regions.push({
        start: block.start,
        end: block.end,
        blocks: 1,
        visualProps: block.visualProps,
        score: block.editableScore,
        selectors: [block.selector]
      });
    }
  }
  return regions;
}

function summarizeCssRegions(lines) {
  const blocks = getCssRuleBlocks(lines);
  if (!blocks.length) return [];

  const coreRegions = mergeCssRegions(
    blocks,
    (block) => block.editableScore >= 3 && block.lowValueScore === 0,
    18
  )
    .filter((region) => region.visualProps >= 2 || region.blocks >= 2)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.start - b.start;
    })
    .slice(0, 6)
    .sort((a, b) => a.start - b.start);

  const lowRegions = mergeCssRegions(
    blocks,
    (block) => block.lowValueScore >= 3,
    40
  )
    .filter((region) => region.blocks >= 5 || (region.end - region.start) >= 80)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, 3)
    .sort((a, b) => a.start - b.start);

  const output = ['Heuristic regions:'];
  if (coreRegions.length) {
    output.push('- likely core editable regions:');
    for (const region of coreRegions) {
      output.push(`  - lines ${region.start}:${region.end} selectors=${region.selectors.slice(0, 4).join(', ')}`);
    }
  }
  if (lowRegions.length) {
    output.push('- likely low-value/generated regions:');
    for (const region of lowRegions) {
      output.push(`  - lines ${region.start}:${region.end} selectors=${region.selectors.slice(0, 3).join(', ')}`);
    }
  }
  if (coreRegions.length) {
    const first = coreRegions[0];
    output.push(`- recommended first expansion: --lines ${Math.max(1, first.start - 5)}:${Math.min(lines.length, first.end + 20)}`);
  }
  return output.length > 1 ? output : [];
}

function summarizeCssComponentMap(lines) {
  const blocks = getCssRuleBlocks(lines);
  if (!blocks.length) return [];

  const regions = [];
  const lowValue = [];

  for (const block of blocks) {
    if (block.lowValueScore >= 3) {
      const lastLow = lowValue[lowValue.length - 1];
      if (lastLow && block.start - lastLow.end <= 40) {
        lastLow.end = block.end;
        lastLow.blocks += 1;
        if (lastLow.selectors.length < 3) lastLow.selectors.push(block.selector);
      } else {
        lowValue.push({ start: block.start, end: block.end, blocks: 1, selectors: [block.selector] });
      }
      continue;
    }

    const label = classifyCssComponent(block.selector);
    if (!label) continue;

    const last = regions[regions.length - 1];
    if (last && last.label === label && block.start - last.end <= 70) {
      last.end = block.end;
      last.blocks += 1;
      last.score += block.editableScore + block.visualProps;
      if (last.selectors.length < 4) last.selectors.push(block.selector);
    } else {
      regions.push({
        label,
        start: block.start,
        end: block.end,
        blocks: 1,
        score: block.editableScore + block.visualProps,
        selectors: [block.selector]
      });
    }
  }

  const regionPriority = [
    'theme/base',
    'nav/header',
    'hero',
    'buttons/actions',
    'visual/details',
    'cards/panels',
    'layout/sections',
    'forms/inputs',
    'feedback/overlays',
    'lists/grids',
    'footer'
  ];
  const usefulRegions = [];
  const picked = new Set();
  for (const label of regionPriority) {
    const match = regions
      .filter((region, index) => region.label === label && !picked.has(index))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.start - b.start;
      })[0];
    if (!match) continue;
    usefulRegions.push(match);
    picked.add(regions.indexOf(match));
    if (usefulRegions.length >= 8) break;
  }
  if (usefulRegions.length < 8) {
    for (const region of regions
      .map((region, index) => ({ region, index }))
      .filter((item) => !picked.has(item.index))
      .sort((a, b) => {
        if (b.region.score !== a.region.score) return b.region.score - a.region.score;
        return a.region.start - b.region.start;
      })) {
      usefulRegions.push(region.region);
      picked.add(region.index);
      if (usefulRegions.length >= 8) break;
    }
  }
  usefulRegions.sort((a, b) => a.start - b.start);

  const lowRegions = lowValue
    .filter((region) => region.blocks >= 5 || (region.end - region.start) >= 80)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, 2)
    .sort((a, b) => a.start - b.start);

  const out = ['Component map:'];
  for (const region of usefulRegions) {
    out.push(`- ${region.label}: lines ${region.start}:${region.end} (${region.selectors.join(', ')})`);
  }
  for (const region of lowRegions) {
    out.push(`- low-value/generated: lines ${region.start}:${region.end} (${region.selectors.join(', ')}), avoid unless asked`);
  }

  const expansionHints = [];
  const firstCandidates = usefulRegions.filter((region) => ['theme/base', 'nav/header', 'hero', 'buttons/actions'].includes(region.label));
  const first = firstCandidates.length ? {
    start: Math.min(...firstCandidates.map((region) => region.start)),
    end: Math.max(...firstCandidates.map((region) => region.end))
  } : usefulRegions[0];
  if (first) expansionHints.push(`- first expand: --lines ${Math.max(1, first.start - 5)}:${Math.min(lines.length, first.end + 20)}`);
  const cardRegions = usefulRegions.filter((region) => /card|panel|visual/.test(region.label));
  if (cardRegions.length) {
    const formatted = cardRegions
      .slice(0, 2)
      .map((region) => `--lines ${Math.max(1, region.start - 5)}:${Math.min(lines.length, region.end + 20)}`)
      .join(' OR ');
    expansionHints.push(`- card/panel task: ${formatted}`);
  }
  const themeRegion = usefulRegions.find((region) => region.label === 'theme/base');
  if (themeRegion && themeRegion !== first) {
    expansionHints.push(`- color/theme task: --lines ${Math.max(1, themeRegion.start - 2)}:${Math.min(lines.length, themeRegion.end + 10)}`);
  }
  if (expansionHints.length) {
    out.push('Recommended expansions:');
    out.push(...expansionHints.slice(0, 3));
  }

  return out.length > 1 ? out : [];
}

function extractCssKeyVariables(lines) {
  const variables = extractCssVariables(lines);
  return variables
    .map((item) => {
      const name = String(item.text || '').split(':')[0] || '';
      let score = 0;
      if (CSS_KEY_VARIABLE_RE.test(name)) score += 4;
      if (/--(?:bg|background|surface|primary|secondary|accent|cyan|orange|border|radius|shadow|glass)/i.test(name)) score += 3;
      if (/--(?:text|muted|font|ease|transition)/i.test(name)) score += 1;
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.line - b.line;
    });
}

function renderSection(title, items, max, formatter, omittedLabel) {
  const { visible, omitted } = takeWithOmitted(items, max);
  if (!visible.length && !omitted) return [];
  const lines = [`${title}:`];
  for (const item of visible) {
    lines.push(formatter(item));
  }
  const omittedLine = formatOmitted(omittedLabel, omitted);
  if (omittedLine) lines.push(omittedLine);
  return lines;
}

function summarizeCss(lines, anchors) {
  const variables = extractCssVariables(lines);
  const keyVariables = extractCssKeyVariables(lines);
  const colors = extractCssColors(lines);
  const atRules = extractCssAtRules(lines);
  const componentMap = summarizeCssComponentMap(lines);
  const showColors = keyVariables.length < 4;

  return [
    ...componentMap,
    ...renderSection('Key variables', keyVariables.length ? keyVariables : variables, 8, (item) => `- line ${item.line} ${item.text}`, 'css variables'),
    ...(showColors ? renderSection('Top colors', colors, 5, (item) => `- ${item.color} count=${item.count} first=line ${item.firstLine}`, 'colors') : []),
    ...renderSection('Media and animations', atRules, 3, (item) => `- line ${item.line} ${item.text}`, 'media/animation rules')
  ];
}

function stripHtmlTags(text) {
  return truncateText(String(text || '').replace(/<script\b[^>]*>.*?<\/script>/gi, '').replace(/<style\b[^>]*>.*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '), 120);
}

function extractHtmlSections(lines) {
  const out = [];
  const re = /^\s*<(section|main|header|footer|nav|article|aside|div)\b[^>]*(?:id|class)=["'][^"']+["'][^>]*>/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 90) });
  }
  return out;
}

function extractHtmlIdsAndClasses(lines) {
  const out = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatches = line.matchAll(/\bid=["']([^"']+)["']/gi);
    for (const match of idMatches) {
      const value = `#${match[1]}`;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ line: i + 1, text: value });
    }

    const classMatches = line.matchAll(/\bclass=["']([^"']+)["']/gi);
    for (const match of classMatches) {
      for (const name of match[1].split(/\s+/).filter(Boolean)) {
        const value = `.${name}`;
        if (seen.has(value)) continue;
        seen.add(value);
        out.push({ line: i + 1, text: value });
      }
    }
  }

  return out;
}

function extractHtmlInteractive(lines) {
  const out = [];
  const re = /<(button|form|input|select|textarea|label|a)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 90) });
  }
  return out;
}

function extractHtmlAssets(lines) {
  const out = [];
  const re = /<(img|script|style|link|source|video|canvas|svg)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: truncateText(lines[i], 90) });
  }
  return out;
}

function extractHtmlHeadings(lines) {
  const out = [];
  const re = /<h[1-6]\b[^>]*>.*?<\/h[1-6]>/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) out.push({ line: i + 1, text: stripHtmlTags(lines[i]) });
  }
  return out;
}

function summarizeHtml(lines) {
  const sections = extractHtmlSections(lines);
  const idsAndClasses = extractHtmlIdsAndClasses(lines);
  const interactive = extractHtmlInteractive(lines);
  const assets = extractHtmlAssets(lines);
  const headings = extractHtmlHeadings(lines);

  return [
    ...renderSection('HTML sections', sections, 12, (item) => `- line ${item.line} ${item.text}`, 'sections'),
    ...renderSection('IDs and classes', idsAndClasses, 18, (item) => `- line ${item.line} ${item.text}`, 'ids/classes'),
    ...renderSection('Interactive elements', interactive, 12, (item) => `- line ${item.line} ${item.text}`, 'interactive elements'),
    ...renderSection('Assets scripts and styles', assets, 8, (item) => `- line ${item.line} ${item.text}`, 'asset/script/style lines'),
    ...renderSection('Headings and visible text', headings, 12, (item) => `- line ${item.line} ${item.text}`, 'headings/text snippets')
  ];
}

function buildEditableSummary(lines, anchors, filePath) {
  const ext = getFileExtension(filePath);
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    return summarizeCss(lines, anchors);
  }
  if (['.html', '.htm', '.svg'].includes(ext)) {
    return summarizeHtml(lines);
  }
  return [];
}

function summarizeRead({ filePath, text, artifactId, tokenlessPath, dataDir }) {
  const lines = String(text || '').split(/\r?\n/);
  const beforeTokens = estimateTokens(text);
  const anchors = collectAnchors(lines, filePath);
  const editableSummary = buildEditableSummary(lines, anchors, filePath);
  const ext = getFileExtension(filePath);
  const isCssLike = ['.css', '.scss', '.sass', '.less'].includes(ext);
  const visibleAnchors = editableSummary.length
    ? (isCssLike ? [] : selectVisibleAnchors(anchors).slice(0, 25))
    : selectVisibleAnchors(anchors);
  const artifact = artifactId || 'null';
  const commandPrefix = tokenlessPath
    ? `node '${String(tokenlessPath).replace(/'/g, "'\\''")}'`
    : 'tokenless';
  const dataDirPart = dataDir ? ` --data-dir '${String(dataDir).replace(/'/g, "'\\''")}'` : '';
  const aroundExample = anchors[0] ? anchors[0].text.split(/\s+/).slice(0, 2).join(' ') : path.basename(filePath || '');

  const packet = [
    'TOKENLESS-READ-PACKET/0.1',
    '',
    `Tool: Read`,
    `File: ${filePath || '(unknown)'}`,
    `Type: ${ext || '(none)'}`,
    `Lines: ${lines.length}`,
    `Original tokens estimated: ${beforeTokens}`,
    '',
    'Safety rule:',
    '- Do not edit from this packet alone. Expand exact evidence first.',
    '- For fuzzy style tasks, start with variables or one high-impact component.',
    '- Expand more only if needed; avoid broad redesign unless the user asks.',
    '- Keep tool inputs small: no large heredoc, cat > script, node -e, or python patch scripts.',
    '',
    ...(editableSummary.length ? ['Editable summary:', ...editableSummary, ''] : []),
    ...(!isCssLike ? [
      'Structure anchors:',
      ...(visibleAnchors.length ? visibleAnchors.map((item) => `- line ${item.line} [${item.type}] ${item.text}`) : ['- (no anchors detected)']),
      ''
    ] : []),
    'Expand before editing:',
    `- ${commandPrefix} expand ${artifact} --around "${aroundExample.replace(/"/g, '\\"')}"${dataDirPart}`,
    `- ${commandPrefix} expand ${artifact} --lines 1:120${dataDirPart}`,
    '',
    `Raw artifact: ${commandPrefix} show ${artifact}${dataDirPart}`,
    ''
  ].join('\n');

  return {
    text: packet,
    beforeTokens,
    afterTokens: estimateTokens(packet),
    anchors,
    reducer: 'read-packet'
  };
}

module.exports = {
  shouldCompactRead,
  summarizeRead,
  getFileExtension
};
