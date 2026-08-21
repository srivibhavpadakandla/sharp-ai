/**
 * Source adapter: Telemark (github.com/sharpfacerobotics/telemark).
 *
 * Telemark is this project's sibling: a two track FTC curriculum whose lessons
 * are written by the same team. Ingesting it is what turns a general FTC
 * question answerer into a tutor for the curriculum a student is actually
 * reading, and it is the only source here whose text we own outright, so
 * canExcerpt is unambiguous.
 *
 * Lessons are MDX. The JSX is stripped rather than rendered: a calculator
 * embed carries no prose, and its component name in the index would only
 * produce false matches on words like "Result" and "Field".
 *
 * Adapters only normalise; chunking lives in lib/chunk.js.
 */
import fs from 'node:fs';
import path from 'node:path';

export const meta = {
  sourceId: 'telemark',
  sourceName: 'Telemark',
  homepage: 'https://sharpfacerobotics.github.io/telemark',
  license: 'Team owned',
  licenseUrl: 'https://github.com/sharpfacerobotics/telemark',
  attribution: 'Telemark — https://sharpfacerobotics.github.io/telemark',
  canExcerpt: true,
  // Above gm0: when our own lesson answers the question, quote the lesson the
  // student can actually open and continue reading.
  priority: 20,
};

const BASE_URL = 'https://sharpfacerobotics.github.io/telemark';

/** Track roots inside the Telemark repo, mapped to their public route base. */
const TRACKS = [
  {dir: 'mechanical', routeBase: '/mechanical', category: 'Mechanical'},
  {dir: 'docs', routeBase: '/docs', category: 'Software'},
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Frontmatter is only needed for the id and title, so this stays deliberately small. */
function frontmatter(raw) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!match) return {data: {}, body: raw};
  const data = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return {data, body: raw.slice(match[0].length)};
}

function stripMdx(body) {
  return body
    // import lines and self closing or wrapping JSX carry no prose
    .replace(/^import\s+.*$/gm, '')
    .replace(/<\/?[A-Z][\w.]*(\s[^>]*)?\/?>/g, '')
    .replace(/^:::\w*.*$/gm, '')
    .replace(/^:::$/gm, '')
    .replace(/<details>|<\/details>|<summary>|<\/summary>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function anchorFor(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Splits a lesson on its markdown headings, which is the same unit the page
 * itself scrolls to, so a citation lands on the paragraph it came from.
 */
function sectionsOf(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  let index = 0;

  const push = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (body) {
      sections.push({
        level: current.level,
        title: current.title,
        anchor: current.anchor,
        body,
        index: index++,
      });
    }
  };

  for (const line of lines) {
    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      push();
      const title = heading[2].replace(/[*`]/g, '').trim();
      current = {level: heading[1].length, title, anchor: anchorFor(title), lines: []};
    } else if (current) {
      current.lines.push(line);
    } else {
      current = {level: 2, title: 'Overview', anchor: 'overview', lines: [line]};
    }
  }
  push();
  return sections;
}

export function loadDocuments(opts = {}) {
  const root = opts.root || path.join(process.cwd(), 'vendor', 'telemark');
  const docs = [];

  for (const track of TRACKS) {
    for (const file of walk(path.join(root, track.dir)).sort()) {
      if (!file.endsWith('.mdx') && !file.endsWith('.md')) continue;

      const {data, body} = frontmatter(fs.readFileSync(file, 'utf8'));
      const text = stripMdx(body);
      if (!data.id || text.length < 200) continue;

      const rel = path.relative(path.join(root, track.dir), file);
      const dir = path.dirname(rel);
      // An explicit slug wins, because Docusaurus resolves it against the
      // plugin's route base and ignores both the id and the folder. Without
      // this the adapter cites a page that does not exist. Otherwise the route
      // comes from the frontmatter id rather than the filename, since lesson
      // files are numbered for ordering and the numbers are not in the URL.
      const route = data.slug
        ? `${track.routeBase}/${data.slug.replace(/^\//, '')}`
        : dir === '.'
          ? `${track.routeBase}/${data.id}`
          : `${track.routeBase}/${dir}/${data.id}`;

      const sections = sectionsOf(text);
      if (!sections.length) continue;

      docs.push({
        sourceId: meta.sourceId,
        sourceName: meta.sourceName,
        license: meta.license,
        canExcerpt: meta.canExcerpt,
        category: track.category,
        docPath: route.replace(/^\//, ''),
        pageTitle: data.title || data.sidebar_label || data.id,
        pageUrl: `${BASE_URL}${route}`,
        sections,
      });
    }
  }
  return docs;
}
