/**
 * reStructuredText -> normalised document, for Sphinx-flavoured sources.
 *
 * This is deliberately NOT a general RST implementation. It does one job well:
 * split a page into its heading sections and turn each section's body into
 * clean prose + code that is worth embedding. Anything that carries no
 * retrieval value (3D viewers, raw HTML, toctrees, image geometry) is dropped.
 *
 * Output shape is source-agnostic — see chunk.js.
 */
import { createAnchorAllocator } from '../../../worker/src/lib/slug.js';

// Sphinx section adornment characters, in no fixed order: RST assigns levels by
// order of first appearance within a document.
const ADORNMENT = /^([=\-`:.'"~^_*+#])\1{1,}\s*$/;

const DIRECTIVE = /^(\s*)\.\.[ \t]+([a-zA-Z][a-zA-Z0-9_-]*)::[ \t]*(.*)$/;
const TARGET = /^(\s*)\.\.[ \t]+_([^:]+):[ \t]*$/;
const COMMENT = /^(\s*)\.\.(?:[ \t]+(.*))?$/;
const FIELD = /^\s*:([a-zA-Z][a-zA-Z0-9_-]*):[ \t]*(.*)$/;

/** Directives whose entire block is noise for a text index. */
const DROP = new Set([
  'toctree', 'image', 'raw', 'only', 'graphviz', 'role', 'include',
  'rediraffe_redirects', 'contents', 'sectionauthor', 'highlight',
  'youtube', 'video', 'meta', 'index', 'default-image-settings',
]);

/** Admonitions: keep the content, prefix it so the model knows its weight. */
const ADMONITIONS = {
  note: 'Note', tip: 'Tip', warning: 'Warning', important: 'Important',
  attention: 'Attention', danger: 'Danger', caution: 'Caution', hint: 'Hint',
  seealso: 'See also', error: 'Error', sidebar: 'Aside',
};

const CODE = new Set(['code-block', 'code', 'literalinclude', 'sourcecode']);

const SUBSTITUTIONS = {
  reg: '®', deg: '°', trade: '™', copy: '©',
  plusmn: '±', times: '×', micro: 'µ', frac12: '½',
  gm0: 'Game Manual 0', gm1: 'Game Manual Part 1', gm2: 'Game Manual Part 2',
  cm: 'Competition Manual', EN: 'Engineering Notebook', EP: 'Engineering Portfolio',
};

// ---------------------------------------------------------------------------
// Inline markup
// ---------------------------------------------------------------------------

export function cleanInline(text) {
  let s = text;

  // Interpreted-text roles. `:term:`Label <Target>`` keeps the label a human reads.
  s = s.replace(/:([a-zA-Z][a-zA-Z0-9_+:.-]*):`([^`]*)`/g, (_m, role, body) => {
    const angled = body.match(/^(.*?)\s*<([^<>]*)>$/s);
    const label = angled ? angled[1].trim() : body.trim();
    if (role === 'code') return '`' + label + '`';
    if (role === 'math') return label;
    return label;
  });

  // Hyperlinks: `Text <url>`_ / `Text <url>`__ . Keeping the URL is deliberate —
  // gm0 links out to vendor part pages and those are often the real answer.
  s = s.replace(/`([^`<]+?)\s*<([^<>]+)>`__?/g, (_m, label, href) =>
    /^(https?:)?\/\//.test(href.trim()) ? `${label.trim()} (${href.trim()})` : label.trim());

  s = s.replace(/``([^`]+)``/g, '`$1`');          // inline literal
  s = s.replace(/`([^`]+)`_+/g, '$1');            // named reference
  s = s.replace(/\|([a-zA-Z0-9_-]+)\|/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(SUBSTITUTIONS, name) ? SUBSTITUTIONS[name] : '');
  s = s.replace(/\\ /g, '');                      // RST escaped space
  s = s.replace(/\\([^\\])/g, '$1');              // other RST escapes
  s = s.replace(/_{2,}$/g, '');
  return s;
}

// ---------------------------------------------------------------------------
// Block processing
// ---------------------------------------------------------------------------

function indentOf(line) {
  const m = line.match(/^[ \t]*/);
  return m ? m[0].length : 0;
}

function dedent(lines) {
  const widths = lines.filter((l) => l.trim()).map(indentOf);
  if (!widths.length) return lines.map(() => '');
  const min = Math.min(...widths);
  return lines.map((l) => (l.trim() ? l.slice(min) : ''));
}

/** Collect the indented block belonging to a directive/target at `start`. */
function collectBlock(lines, start, ownIndent) {
  const out = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { out.push(''); i += 1; continue; }
    if (indentOf(line) <= ownIndent) break;
    out.push(line);
    i += 1;
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return { block: dedent(out), next: i };
}

/** Strip a directive block's leading `:option: value` field list. */
function stripOptions(block) {
  let i = 0;
  while (i < block.length && FIELD.test(block[i])) i += 1;
  const opts = {};
  for (let j = 0; j < i; j += 1) {
    const m = block[j].match(FIELD);
    if (m) opts[m[1]] = m[2].trim();
  }
  while (i < block.length && !block[i].trim()) i += 1;
  return { opts, rest: block.slice(i) };
}

/** A `.. glossary::` block is a definition list: term line, indented definition. */
function renderGlossary(block) {
  const out = [];
  let i = 0;
  while (i < block.length) {
    const line = block[i];
    if (!line.trim() || FIELD.test(line)) { i += 1; continue; }
    if (indentOf(line) === 0) {
      const term = cleanInline(line.trim());
      const { block: def, next } = collectBlock(block, i + 1, 0);
      const body = renderBody(def).trim();
      out.push(body ? `${term} — ${body}` : term);
      i = next;
    } else {
      i += 1;
    }
  }
  return out.join('\n\n');
}

/**
 * Turn a body block (already dedented) into clean text.
 * Recursive: directive contents are processed with the same rules.
 */
export function renderBody(lines) {
  const parts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    const dir = line.match(DIRECTIVE);
    if (dir) {
      const [, indent, rawName, arg] = dir;
      const name = rawName.toLowerCase();
      const { block, next } = collectBlock(lines, i + 1, indent.length);
      i = next;

      if (DROP.has(name)) continue;

      if (CODE.has(name)) {
        const { rest } = stripOptions(block);
        const code = rest.join('\n').replace(/\s+$/, '');
        if (code.trim()) parts.push('```' + (arg.trim() || 'java') + '\n' + code + '\n```');
        continue;
      }

      if (name === 'glossary') {
        const g = renderGlossary(block);
        if (g) parts.push(g);
        continue;
      }

      if (name === 'figure') {
        // Keep only the human-meaningful part: alt text and/or caption.
        const { opts, rest } = stripOptions(block);
        const caption = renderBody(rest).trim();
        const label = caption || opts.alt || '';
        if (label) parts.push(`(Figure: ${cleanInline(label)})`);
        continue;
      }

      if (name === 'math') {
        const { rest } = stripOptions(block);
        const m = (arg + '\n' + rest.join('\n')).trim();
        if (m) parts.push(m);
        continue;
      }

      if (name in ADMONITIONS) {
        const { rest } = stripOptions(block);
        const inner = renderBody(rest.length ? rest : [arg]).trim();
        const title = name === 'sidebar' && arg.trim() ? arg.trim() : ADMONITIONS[name];
        if (inner) parts.push(`**${title}:** ${inner}`);
        continue;
      }

      if (name === 'admonition') {
        const { rest } = stripOptions(block);
        const inner = renderBody(rest).trim();
        const title = cleanInline(arg.trim()) || 'Note';
        if (inner) parts.push(`**${title}:** ${inner}`);
        continue;
      }

      if (name === 'tab-item' || name === 'dropdown' || name === 'card' ||
          name === 'grid-item-card' || name === 'tab-set' || name === 'grid' ||
          name === 'table' || name === 'list-table' || name === 'container') {
        const { rest } = stripOptions(block);
        const inner = renderBody(rest).trim();
        const label = cleanInline(arg.trim());
        if (!inner) continue;
        if (label && (name === 'tab-item' || name === 'dropdown' ||
                      name === 'card' || name === 'grid-item-card' || name === 'table')) {
          parts.push(`*${label}*\n${inner}`);
        } else {
          parts.push(inner);
        }
        continue;
      }

      // Unknown directive: keep its content, drop the marker.
      const { rest } = stripOptions(block);
      const inner = renderBody(rest).trim();
      if (inner) parts.push(inner);
      continue;
    }

    // `.. _label:` targets and `.. comment` blocks contribute nothing to text.
    if (TARGET.test(line) || COMMENT.test(line)) {
      const ind = indentOf(line);
      const { next } = collectBlock(lines, i + 1, ind);
      i = next;
      continue;
    }

    // Substitution definition: `.. |name| replace:: text`
    if (/^\s*\.\.\s+\|/.test(line)) { i += 1; continue; }

    // Literal block introduced by a trailing `::`
    if (/::\s*$/.test(line) && !FIELD.test(line)) {
      const lead = cleanInline(line.replace(/\s*::\s*$/, '')).trim();
      const { block, next } = collectBlock(lines, i + 1, indentOf(line));
      i = next;
      if (lead) parts.push(lead + ':');
      const code = block.join('\n').replace(/\s+$/, '');
      if (code.trim()) parts.push('```\n' + code + '\n```');
      continue;
    }

    // Field list at body level (page metadata) — skip.
    if (FIELD.test(line) && indentOf(line) === 0) { i += 1; continue; }

    // A nested section heading inside a directive body (grid cards in gm0 do
    // this). renderBody has no section machinery, so demote it to bold text
    // rather than leaking the `^^^` adornment into the index.
    if (i + 1 < lines.length && ADORNMENT.test(lines[i + 1]) && !ADORNMENT.test(line)) {
      const t = cleanInline(line.trim());
      if (t) parts.push(`**${t}**`);
      i += 2;
      continue;
    }

    // Plain paragraph / list item: consume until a blank line.
    const para = [];
    while (i < lines.length && lines[i].trim() && !DIRECTIVE.test(lines[i]) &&
           !TARGET.test(lines[i]) && !/^\s*\.\.\s/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    const isList = /^\s*([-*+]|\d+[.)]|#\.)\s+/.test(para[0] || '');
    const text = isList
      ? para.map((l) => cleanInline(l.replace(/^\s+/, ' ').replace(/^ /, ''))).join('\n')
      : cleanInline(para.map((l) => l.trim()).join(' '));
    if (text.trim()) parts.push(text.trim());
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Document / section splitting
// ---------------------------------------------------------------------------

/**
 * @returns {{pageTitle:string, sections:Array<{level:number,title:string,anchor:string,body:string,index:number}>}}
 */
export function parseRst(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const levels = [];                 // adornment chars in order of first appearance
  const anchors = createAnchorAllocator();
  const sections = [];

  let pendingTarget = null;
  let pageTitle = null;
  let current = null;                // { level, title, anchor, lines: [] }
  let preamble = [];

  const push = () => {
    if (!current) return;
    sections.push({
      level: current.level,
      title: current.title,
      anchor: current.anchor,
      lines: current.lines,
      index: sections.length,
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const t = line.match(TARGET);
    if (t) { pendingTarget = t[2].trim(); continue; }

    const next = lines[i + 1];
    const prev = lines[i - 1];

    // Overline form: adornment / title / adornment
    const isOverline = prev !== undefined && ADORNMENT.test(prev || '') &&
      line.trim() && next !== undefined && ADORNMENT.test(next || '') &&
      (prev || '').trim()[0] === (next || '').trim()[0];

    const isUnderline = line.trim() && next !== undefined && ADORNMENT.test(next) &&
      next.trim().length >= Math.min(line.trim().length, 3) &&
      !ADORNMENT.test(line);

    if (isOverline || isUnderline) {
      const char = (isOverline ? prev : next).trim()[0];
      const key = (isOverline ? 'over:' : '') + char;
      let level = levels.indexOf(key);
      if (level === -1) { levels.push(key); level = levels.length - 1; }

      const title = cleanInline(line.trim());
      push();
      const anchor = anchors.allocate(title, pendingTarget);
      pendingTarget = null;
      if (pageTitle === null) pageTitle = title;
      current = { level: level + 1, title, anchor, lines: [] };
      i += 1;                                   // skip the underline
      continue;
    }

    if (!current) preamble.push(line);
    else current.lines.push(line);
  }
  push();

  const rendered = sections.map((s) => ({
    level: s.level,
    title: s.title,
    anchor: s.anchor,
    index: s.index,
    body: renderBody(dedent(s.lines)).trim(),
  }));

  return { pageTitle: pageTitle || '', sections: rendered };
}
