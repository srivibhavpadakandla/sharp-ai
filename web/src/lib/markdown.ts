/**
 * A very small Markdown renderer.
 *
 * Deliberately hand-written rather than pulled from npm: the answer surface is
 * the one place untrusted model output becomes HTML, so the escaping story
 * needs to be short enough to read in one sitting. Everything is escaped
 * first; only our own markup is added afterwards.
 *
 * It also turns `[3]` citation markers into buttons the split-pane can bind to.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render the small amount of LaTeX that survives ingest into readable text.
 *
 * gm0's control-theory pages use Sphinx math, so answers were arriving with
 * `f(t) = K_p e(t) + K_i \\int_o^t e(t) \\mathrm{d}t` printed literally —
 * the raw input, not an equation. A full typesetting library is a heavy
 * dependency for 43 chunks; Unicode covers the cases that actually appear.
 */
const GREEK: Record<string, string> = {
  alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4', theta: '\u03b8',
  lambda: '\u03bb', mu: '\u03bc', pi: '\u03c0', sigma: '\u03c3', tau: '\u03c4',
  phi: '\u03c6', omega: '\u03c9', Delta: '\u0394', Omega: '\u03a9',
};
const SUB: Record<string, string> = {
  0: '\u2080', 1: '\u2081', 2: '\u2082', 3: '\u2083', 4: '\u2084', 5: '\u2085',
  6: '\u2086', 7: '\u2087', 8: '\u2088', 9: '\u2089',
  a: '\u2090', e: '\u2091', i: '\u1d62', o: '\u2092', p: '\u209a', t: '\u209c',
  d: 'd', v: 'v', f: 'f', s: 's', n: 'n', k: 'k',
};
const SUP: Record<string, string> = {
  0: '\u2070', 1: '\u00b9', 2: '\u00b2', 3: '\u00b3', 4: '\u2074',
  5: '\u2075', 6: '\u2076', 7: '\u2077', 8: '\u2078', 9: '\u2079',
};

function renderMath(src: string): string {
  let m = src;
  m = m.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  m = m.replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1');
  m = m.replace(/\\text\s*\{([^{}]*)\}/g, '$1');
  m = m.replace(/\\sqrt\s*\{([^{}]*)\}/g, '\u221a($1)');
  m = m.replace(/\\(int|sum|infty|cdot|times|approx|leq|geq|neq|pm|rightarrow|to)\b/g,
    (_x, w) => ({ int: '\u222b', sum: '\u2211', infty: '\u221e', cdot: '\u00b7', times: '\u00d7',
      approx: '\u2248', leq: '\u2264', geq: '\u2265', neq: '\u2260', pm: '\u00b1',
      rightarrow: '\u2192', to: '\u2192' } as Record<string, string>)[w] || w);
  m = m.replace(/\\([A-Za-z]+)/g, (_x, w) => GREEK[w] ?? w);
  // subscripts and superscripts, braced or single-character
  m = m.replace(/_\{([^{}]{1,4})\}|_([A-Za-z0-9])/g, (_x, a, b) => {
    const t = a ?? b;
    return [...String(t)].map((ch) => SUB[ch] ?? ch).join('');
  });
  m = m.replace(/\^\{([^{}]{1,4})\}|\^([A-Za-z0-9])/g, (_x, a, b) => {
    const t = a ?? b;
    return [...String(t)].map((ch) => SUP[ch] ?? ch).join('');
  });
  return m.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function inline(escaped: string, citationNumbers: Set<number>): string {
  let s = escaped;
  // Math first: $...$ and $$...$$ become typeset-ish spans rather than raw source.
  s = s.replace(/\$\$([^$]{1,400})\$\$/g, (_m, body) => `<span class="math math--block">${renderMath(body)}</span>`);
  s = s.replace(/\$([^$\n]{1,200})\$/g, (_m, body) => `<span class="math">${renderMath(body)}</span>`);
  // Bare LaTeX that never had delimiters, e.g. K_p or \\frac in prose.
  s = s.replace(/(?:\\[A-Za-z]+(?:\{[^{}]*\})*|\b[A-Za-z]_\{?[A-Za-z0-9]{1,3}\}?)+/g,
    (m) => (/[\\_]/.test(m) ? `<span class="math">${renderMath(m)}</span>` : m));
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // Links: only http(s) survive; anything else stays as plain text.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
  // Citation markers -> interactive chips. [2] or [2, 4] or [2][4]
  s = s.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (_m, group: string) => {
    const nums = group.split(',').map((n) => Number(n.trim()));
    return nums.map((n) => {
      if (!citationNumbers.has(n)) return `[${n}]`;
      return `<button type="button" class="cite" data-cite="${n}" aria-label="Jump to source ${n}">${n}</button>`;
    }).join('');
  });
  return s;
}

export function renderMarkdown(md: string, citationCount = 0): string {
  const nums = new Set(Array.from({ length: citationCount }, (_, i) => i + 1));
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre data-lang="${escapeHtml(lang)}"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) { i += 1; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(6, Math.max(3, h[1].length));
      out.push(`<h${level}>${inline(escapeHtml(h[2]), nums)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inline(escapeHtml(buf.join(' ')), nums)}</blockquote>`);
      continue;
    }

    const bullet = /^\s*([-*+])\s+/;
    const ordered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || ordered.test(line)) {
      const isOrdered = ordered.test(line);
      const re = isOrdered ? ordered : bullet;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(`<li>${inline(escapeHtml(lines[i].replace(re, '')), nums)}</li>`);
        i += 1;
      }
      out.push(`<${isOrdered ? 'ol' : 'ul'}>${items.join('')}</${isOrdered ? 'ol' : 'ul'}>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i])
           && !/^#{1,6}\s/.test(lines[i]) && !bullet.test(lines[i]) && !ordered.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(escapeHtml(para.join(' ')), nums)}</p>`);
  }

  return out.join('\n');
}
