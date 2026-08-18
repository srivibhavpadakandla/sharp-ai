/**
 * Source adapters for the FTC SDK itself.
 *
 *   ftc-sdk-samples : the 65 official sample OpModes shipped in
 *                     FtcRobotController/.../external/samples
 *   ftc-sdk-api     : class and method documentation from the published javadoc
 *
 * Both are BSD 3-Clause (Copyright FIRST), which permits redistribution with
 * the notice — so unlike REV or FTCLib these are fully excerptable.
 *
 * The samples matter for code generation specifically: it currently grounds on
 * gm0's ~80 illustrative snippets, while these are the canonical, compiling,
 * officially maintained OpModes teams are told to copy.
 */
import fs from 'node:fs';
import path from 'node:path';

const ATTRIBUTION = 'FTC SDK — Copyright (c) 2014-2024 FIRST — BSD 3-Clause';

// ---------------------------------------------------------------------------
// Sample OpModes
// ---------------------------------------------------------------------------

export const samples = {
  meta: {
    sourceId: 'ftc-sdk-samples',
    sourceName: 'FTC SDK Samples',
    homepage: 'https://github.com/FIRST-Tech-Challenge/FtcRobotController',
    license: 'BSD 3-Clause',
    licenseUrl: 'https://github.com/FIRST-Tech-Challenge/FtcRobotController/blob/master/LICENSE',
    attribution: ATTRIBUTION,
    canExcerpt: true,
    priority: 8,
  },

  loadChunks() {
    const root = path.join(process.cwd(), 'vendor', 'ftc-sdk',
      'FtcRobotController/src/main/java/org/firstinspires/ftc/robotcontroller/external/samples');
    if (!fs.existsSync(root)) throw new Error(`SDK samples not found at ${root}`);

    const out = [];
    for (const file of fs.readdirSync(root).filter((f) => f.endsWith('.java')).sort()) {
      const raw = fs.readFileSync(path.join(root, file), 'utf8');
      const name = file.replace(/\.java$/, '');

      // The licence header is boilerplate on every file; the SECOND block
      // comment is the one that explains what the sample demonstrates.
      const blocks = [...raw.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
      const describing = blocks.find((b) => !/Redistribution and use/i.test(b)) || '';
      const description = describing
        .replace(/^\/\*+|\*+\/$/g, '')
        .split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
        .join('\n').trim();

      // Strip the licence header from the code we store, keep the rest verbatim.
      const code = raw.replace(/\/\*[\s\S]*?Redistribution and use[\s\S]*?\*\//, '').trim();

      const kind = /^Concept/.test(name) ? 'concept'
        : /^Robot/.test(name) ? 'robot'
        : /^Sensor/.test(name) ? 'sensor' : 'basic';

      out.push({
        sourceId: this.meta.sourceId,
        sourceName: this.meta.sourceName,
        docPath: `samples/${name}`,
        pageTitle: name,
        sectionTitle: name,
        headingPath: `FTC SDK Samples > ${name}`,
        anchor: '',
        sourceUrl: 'https://github.com/FIRST-Tech-Challenge/FtcRobotController/blob/master/'
          + `FtcRobotController/src/main/java/org/firstinspires/ftc/robotcontroller/external/samples/${file}`,
        category: 'programming',
        license: this.meta.license,
        canExcerpt: 1,
        text: `# FTC SDK Samples\n## ${name} (official sample OpMode, ${kind})\n\n`
          + `${description}\n\n\`\`\`java\n${code.slice(0, 6000)}\n\`\`\``,
        ordinal: out.length,
        part: 0,
        partCount: 1,
      });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Javadoc API reference
// ---------------------------------------------------------------------------

const strip = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

export const api = {
  meta: {
    sourceId: 'ftc-sdk-api',
    sourceName: 'FTC SDK API',
    homepage: 'https://javadoc.io/doc/org.firstinspires.ftc',
    license: 'BSD 3-Clause',
    licenseUrl: 'https://github.com/FIRST-Tech-Challenge/FtcRobotController/blob/master/LICENSE',
    attribution: ATTRIBUTION,
    canExcerpt: true,
    priority: 12,
  },

  loadChunks() {
    const root = path.join(process.cwd(), 'vendor', 'sdk-javadoc');
    if (!fs.existsSync(root)) throw new Error(`javadoc not unpacked at ${root}`);

    // Only the classes a team actually programs against. The full 1365 pages
    // are mostly internal plumbing and would swamp retrieval with noise.
    const WANTED = /\/(hardware|eventloop\/opmode|util|navigation|vision|robotcore\/external)\//;

    const out = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!e.name.endsWith('.html')) continue;
        if (/^(index|package-|allclasses|deprecated|help-|search|overview|constant|serialized)/.test(e.name)) continue;
        if (!WANTED.test(full.replace(/\\/g, '/'))) continue;

        const html = fs.readFileSync(full, 'utf8');
        const cls = e.name.replace(/\.html$/, '');
        // Derived from the path, not from the page. An earlier regex matched the
        // navbar link labelled "Package" and every class came out as
        // "Package.DcMotor". The directory layout IS the package name.
        const pkg = path.relative(root, path.dirname(full))
          .split(path.sep).slice(1).join('.');

        const blockRaw = (html.match(/<section class="class-description"[\s\S]*?<\/section>/) || [])[0]
          || (html.match(/<div class="block">([\s\S]*?)<\/div>/) || [])[0] || '';
        const description = strip(blockRaw).slice(0, 1200);

        // Method summary: signature plus its one-line description.
        const methods = [...html.matchAll(
          /<code><a[^>]*>(\w+)<\/a>\(([^)]*)\)<\/code>[\s\S]{0,400}?<div class="block">([\s\S]{0,220}?)<\/div>/g,
        )].slice(0, 40).map((m) => `${m[1]}(${strip(m[2])}) — ${strip(m[3])}`);

        if (description.length < 40 && methods.length === 0) continue;

        out.push({
          sourceId: this.meta.sourceId,
          sourceName: this.meta.sourceName,
          docPath: `api/${pkg}.${cls}`,
          pageTitle: cls,
          sectionTitle: cls,
          headingPath: `FTC SDK API > ${pkg} > ${cls}`,
          anchor: '',
          sourceUrl: `https://javadoc.io/doc/org.firstinspires.ftc/RobotCore/latest/${pkg.replace(/\./g, '/')}/${cls}.html`,
          category: 'programming',
          license: this.meta.license,
          canExcerpt: 1,
          text: `# FTC SDK API\n## ${pkg}.${cls}\n\n${description}\n\n`
            + (methods.length ? `Methods:\n${methods.map((m) => `- ${m}`).join('\n')}` : ''),
          ordinal: out.length,
          part: 0,
          partCount: 1,
        });
      }
    };
    walk(root);
    return out;
  },
};
