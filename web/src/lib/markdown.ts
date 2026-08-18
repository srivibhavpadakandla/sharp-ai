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

function inline(escaped: string, citationNumbers: Set<number>): string {
  let s = escaped;
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
