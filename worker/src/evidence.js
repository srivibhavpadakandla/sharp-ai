import corpus from './lib/corpus-info.json' with {type: 'json'};

export function sourceVersion(citation) {
  const id = citation.sourceId || '';
  const declared = corpus.sources.find((source) => source.id === id)?.version;
  if (typeof declared === 'string' && declared.trim()) return declared;
  if (/ftc-sdk/.test(id)) return `FTC SDK ${corpus.sdkVersion}`;
  if (/competition|game-manual|ftc-manual/.test(id) || /Competition Manual/.test(citation.sourceName || '')) return `2026–2027 manual ${corpus.manualVersion}`;
  const version = String(citation.url || '').match(/\/(?:v|version\/)(\d+(?:\.\d+){0,2})(?:\/|$)/i)?.[1];
  return version ? `v${version} (source URL)` : 'Version not specified by index';
}

const STOP = new Set('this that with from have does into your when then only they their should would could'.split(' '));
const words = (s) => new Set((String(s).toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) || []).filter((word) => !STOP.has(word)));
const proseOnly = (s) => s.replace(/`[^`]*`/g, (code) => ' '.repeat(code.length));
const refsIn = (s) => [...proseOnly(s).matchAll(/(?<![\w\]])\[(\d+(?:\s*,\s*\d+)*)\]/g)];
export function buildEvidence(answer, citations, excerpts) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  const textById = new Map(excerpts.map((e) => [e.chunkId, e.text]));
  return String(answer).replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).flatMap((paragraph) => {
    const refs = [...new Set(refsIn(paragraph).flatMap((m) => m[1].split(',').map(Number)))];
    if (!refs.length) return [];
    let claim = paragraph;
    for (const match of refsIn(paragraph).reverse()) claim = claim.slice(0, match.index) + claim.slice(match.index + match[0].length);
    claim = claim.trim().slice(0, 1500);
    const terms = words(claim);
    const sources = refs.map((n) => {
      const c = byN.get(n);
      if (!c) return {n, status: 'missing', passage: null, version: null};
      const text = c.canExcerpt ? textById.get(c.chunkId) : null;
      if (!text) return {n, status: 'restricted', passage: null, version: sourceVersion(c)};
      const passages = text.split(/\n\s*\n/).flatMap((p) => {
        const windows = [];
        for (let start = 0; start < p.length; start += 650) windows.push(p.slice(start, start + 900).trim());
        return windows;
      }).filter(Boolean);
      const ranked = passages.map((passage) => {
        const source = words(passage);
        let hits = 0;
        for (const t of terms) if (source.has(t)) hits++;
        return {passage, score: terms.size ? hits / terms.size : 0};
      }).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      // This is a lexical match, not a proof of entailment. Show that limit in both clients.
      return {n, status: best?.score >= 0.22 ? 'matched' : 'weak',
        passage: best ? best.passage.slice(0, 900) : null, version: sourceVersion(c)};
    });
    return [{claim, sources}];
  }).slice(0, 12);
}

export function isRegulatoryQuestion(question, sources) {
  const official = sources.some((c) => c.sourceId === 'first-qa' || /Competition Manual|Official Team Q&A/.test(c.sourceName || ''));
  return official && /rule|legal|allowed|inspection|scor|season|biobuzz|starting|pre-?load|\b[rgcq]\d{1,3}\b/i.test(question);
}

export function sourcePolicy(question, chunks) {
  const base = `The indexed documentation snapshot is ${corpus.updatedAt}, FTC SDK ${corpus.sdkVersion}. Only claim API behavior explicitly supported by a retrieved method or explanation; similar vocabulary is not evidence of return values or exceptions. Never turn a source's broad topic into a claimed cause of this robot's fault. A causal claim needs explicit support; otherwise label it as a hypothesis or engineering suggestion. `;
  const manual = chunks.some((c) => /Competition Manual/.test(c.sourceName || ''));
  const qaPolicy = chunks.some((c) => c.sourceId === 'first-qa' || c.sourceName === 'FIRST Official Team Q&A')
    ? 'When using official Team Q&A, cite the specific published ruling and its indexed season/version. Treat it as a snapshot and check the original ruling and manual before relying on an interpretation. Do not reproduce restricted Q&A wording; paraphrase it. ' : '';
  return base + qaPolicy + (manual && /rule|legal|allowed|inspection|size|scor|season|biobuzz|\b[rgc]\d{3}\b/i.test(question)
    ? `For competition rules, explicitly name the indexed 2026–2027 Competition Manual revision ${corpus.manualVersion} and snapshot date ${corpus.updatedAt} in the answer. Include explicit qualifications and exemptions from the cited rule that apply to the question. Never add uncited regulatory interpretations or restrictions in an engineering suggestion. Never call it the current or latest manual; the linked manual may have changed since indexing. State that the current official manual and Team Q&A must be checked before relying on an interpretation. Do not invent dimensions or exceptions not supported by the retrieved rule. ` : '');
}

export function manualSnapshotNotice(question, sources) {
  const manual = sources.some((c) => /Competition Manual/.test(c.sourceName || ''));
  const qa = sources.some((c) => c.sourceId === 'first-qa' || c.sourceName === 'FIRST Official Team Q&A');
  if (!qa && !(manual && /rule|legal|allowed|inspection|size|scor|season|biobuzz|\b[rgc]\d{3}\b/i.test(question))) return '';
  const coverage = [manual ? `2026–2027 Competition Manual ${corpus.manualVersion}` : '', qa ? sourceVersion({sourceId: 'first-qa'}) : ''].filter(Boolean).join(' and ');
  return `Indexed rules snapshot: ${coverage}, indexed ${corpus.updatedAt}. This may be out of date. Verify the current official manual and Team Q&A before relying on a rule interpretation.`;
}
