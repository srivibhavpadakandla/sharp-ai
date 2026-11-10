import crypto from 'node:crypto';
import {EMBEDDING_DIM, EMBEDDING_MODEL} from '../../worker/src/lib/query.js';

export const SOURCE_COLUMNS = ['source_id','source_name','homepage','license','license_url','attribution','can_excerpt','priority','updated_at'];
export const CHUNK_COLUMNS = ['chunk_id','source_id','source_name','doc_path','page_title','section_title','heading_path','anchor','source_url','category','license','can_excerpt','excerpt_mode','text','char_len','ordinal','part','part_count','content_hash','updated_at'];
export const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const q = (value) => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const modeFor = (c) => c.excerptMode || (Number(c.canExcerpt) === 1 ? 'full' : 'link');
const byId = (rows, key) => new Map(rows.map((r) => [r[key], r]));
const fingerprint = (row, columns) => sha(JSON.stringify(columns.filter((k) => k !== 'updated_at').map((k) => row[k] ?? null)));

export function chunkRow(c) {
  return Object.fromEntries(CHUNK_COLUMNS.map((key, i) => [key, [c.chunkId,c.sourceId,c.sourceName,c.docPath,c.pageTitle,c.sectionTitle,c.headingPath,c.anchor ?? '',c.sourceUrl,c.category,c.license,Number(c.canExcerpt),modeFor(c),c.text,c.charLen,c.ordinal,c.part,c.partCount,c.contentHash,c.updatedAt][i]]));
}

export function sourceRows(metas, updatedAt) {
  return metas.map((m) => ({source_id:m.sourceId,source_name:m.sourceName,homepage:m.homepage,license:m.license,
    license_url:m.licenseUrl ?? null,attribution:m.attribution ?? null,can_excerpt:m.canExcerpt ? 1 : 0,priority:m.priority ?? 100,updated_at:updatedAt}));
}

export function validateCorpus(chunks, vectors, metas, {minimumChunks = 1} = {}) {
  if (chunks.length < minimumChunks) throw new Error(`Incomplete corpus: ${chunks.length} chunks, expected at least ${minimumChunks}.`);
  const policies = byId(metas, 'sourceId');
  const ids = new Set(), counts = {}, vectorIds = new Set();
  for (const c of chunks) {
    if (!c || typeof c.chunkId !== 'string' || ids.has(c.chunkId) || Buffer.byteLength(c.chunkId) > 64 || !c.chunkId.startsWith(`${c.sourceId}:`)) throw new Error('Invalid or duplicate chunk ID.');
    ids.add(c.chunkId);
    const policy = policies.get(c.sourceId);
    if (!policy) throw new Error(`Unregistered source: ${c.sourceId}`);
    if (typeof c.text !== 'string' || !c.text.trim() || sha(c.text) !== c.contentHash || c.charLen !== c.text.length) throw new Error(`Invalid text/hash: ${c.chunkId}`);
    if (!/^https:\/\//.test(c.sourceUrl || '') || c.license !== policy.license || c.sourceName !== policy.sourceName) throw new Error(`Invalid provenance: ${c.chunkId}`);
    if (![0,1].includes(Number(c.canExcerpt))) throw new Error(`Invalid excerpt flag: ${c.chunkId}`);
    const mode = modeFor(c);
    if (policy.summarizeOnly && (Number(c.canExcerpt) !== 0 || mode !== 'summarize')) throw new Error(`Restricted source policy changed: ${c.chunkId}`);
    if (policy.linkOnly) {
      const expected = `# ${c.sourceName}\n## ${c.headingPath}\n\n${c.sourceName} documents this at "${c.pageTitle}". The text of this page is not reproduced here; open the link to read it.`;
      if (Number(c.canExcerpt) !== 0 || mode !== 'link' || c.text !== expected) throw new Error(`Link-only body text detected: ${c.chunkId}`);
    }
    if (!policy.canExcerpt && Number(c.canExcerpt)) throw new Error(`Excerpt escalation: ${c.chunkId}`);
    if (!['full','summarize','link'].includes(mode) || (mode === 'full') !== Boolean(Number(c.canExcerpt))) throw new Error(`Inconsistent excerpt mode: ${c.chunkId}`);
    for (const field of ['ordinal','part','partCount']) if (!Number.isInteger(c[field]) || c[field] < (field === 'partCount' ? 1 : 0)) throw new Error(`Invalid ${field}: ${c.chunkId}`);
    counts[c.sourceId] = (counts[c.sourceId] || 0) + 1;
  }
  for (const m of metas) if (!counts[m.sourceId]) throw new Error(`Missing configured source: ${m.sourceId}`);
  const current = byId(chunks, 'chunkId');
  for (const v of vectors) {
    if (!v || vectorIds.has(v.id) || !current.has(v.id)) throw new Error('Duplicate or orphan vector.');
    vectorIds.add(v.id);
    const c = current.get(v.id);
    if (!Array.isArray(v.values) || v.values.length !== EMBEDDING_DIM || v.values.some((x) => !Number.isFinite(x))) throw new Error(`Invalid vector values: ${v.id}`);
    if (Math.abs(v.values.reduce((sum, x) => sum + x*x, 0) - 1) > 0.02) throw new Error(`Vector is not normalized: ${v.id}`);
    if (v.metadata?.content_hash !== c.contentHash || v.metadata?.source_id !== c.sourceId || v.metadata?.category !== c.category
      || (v.metadata?.embedding_model && v.metadata.embedding_model !== EMBEDDING_MODEL)) throw new Error(`Vector metadata mismatch: ${v.id}`);
  }
  if (vectorIds.size !== ids.size) throw new Error('Missing current vectors.');
  return {chunks:chunks.length,vectors:vectors.length,counts,dimension:EMBEDDING_DIM,embeddingModel:EMBEDDING_MODEL};
}

function upsert(table, columns, row) {
  const key = columns[0];
  return `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((c) => q(row[c])).join(',')}) ON CONFLICT(${key}) DO UPDATE SET ${columns.slice(1).map((c) => `${c}=excluded.${c}`).join(',')};`;
}

/** Corpus-only delta. No schema changes or private answer, query, feedback, or cache statements. */
export function corpusDelta(beforeSources, beforeChunks, afterSources, afterChunks) {
  const before = byId(beforeChunks,'chunk_id'), after = byId(afterChunks,'chunk_id');
  const previousSources = byId(beforeSources,'source_id');
  const newSources = byId(afterSources,'source_id');
  const changed = afterChunks.filter((c) => !before.has(c.chunk_id) || fingerprint(before.get(c.chunk_id),CHUNK_COLUMNS) !== fingerprint(c,CHUNK_COLUMNS));
  const added = changed.filter((c) => !before.has(c.chunk_id)).map((c) => c.chunk_id);
  const removed = beforeChunks.filter((c) => !after.has(c.chunk_id)).map((c) => c.chunk_id);
  const statements = afterSources.filter((s) => !previousSources.has(s.source_id) || fingerprint(previousSources.get(s.source_id),SOURCE_COLUMNS) !== fingerprint(s,SOURCE_COLUMNS))
    .map((s) => upsert('sources',SOURCE_COLUMNS,s));
  statements.push(...changed.map((c) => upsert('chunks',CHUNK_COLUMNS,c)));
  for (let i=0;i<removed.length;i+=200) statements.push(`DELETE FROM chunks WHERE chunk_id IN (${removed.slice(i,i+200).map(q).join(',')});`);
  for (const s of beforeSources) if (!newSources.has(s.source_id)) statements.push(`DELETE FROM sources WHERE source_id=${q(s.source_id)};`);
  return {sql:statements.join('\n')+'\n',added,removed,changed:changed.filter((c) => before.has(c.chunk_id)).map((c) => c.chunk_id),unchanged:afterChunks.length-changed.length};
}

export function publicationPlan({beforeSources,beforeChunks,chunks,vectors,metas,manifest,beforeManifest,allowSourceLoss=[]}) {
  const validation = validateCorpus(chunks,vectors,metas,{minimumChunks:Math.floor(beforeChunks.length*0.8)});
  const oldCounts = beforeChunks.reduce((out,c) => {out[c.source_id]=(out[c.source_id]||0)+1;return out;},{});
  for (const [id,n] of Object.entries(oldCounts)) if ((validation.counts[id]||0)<n*0.8 && !allowSourceLoss.includes(id)) throw new Error(`Unexpected coverage loss for ${id}: ${n} -> ${validation.counts[id]||0}.`);
  if (manifest.sections !== chunks.length || manifest.sources.some((s) => validation.counts[s.id] !== s.sections)) throw new Error('Corpus manifest counts do not match staged data.');
  const epoch = sha(chunks.map((c) => JSON.stringify([c.chunkId,c.contentHash,c.sourceUrl,c.canExcerpt,c.excerptMode,c.license])).join('\n')).slice(0,16);
  if (epoch !== manifest.epoch) throw new Error('Corpus manifest epoch does not match staged data.');
  const rows = chunks.map(chunkRow), sources = sourceRows(metas,chunks[0].updatedAt);
  const forward = corpusDelta(beforeSources,beforeChunks,sources,rows);
  const rollback = corpusDelta(sources,rows,beforeSources,beforeChunks);
  return {validation,oldCounts,forward,rollback,manifest,beforeManifest,
    summary:{baselineChunks:beforeChunks.length,currentChunks:chunks.length,added:forward.added.length,changed:forward.changed.length,removed:forward.removed.length,unchanged:forward.unchanged,
      previousEpoch:beforeManifest?.epoch ?? null,currentEpoch:manifest.epoch,metadataIndexRequired:{propertyName:'source_id',type:'String'},
      vectorsToUpsert:vectors.length,protectedTablesUntouched:['answers','query_log','feedback'],
      crossStoreAtomic:false,requiresProcessingVerification:true}};
}
