/** Public provenance only; never source bodies, learner data, or account details. */
export function sourceManifestRow(meta, sections) {
  if (!Number.isInteger(sections) || sections < 1) throw new Error(`${meta.sourceId}: missing source in refreshed corpus`);
  const version=meta.version;
  if(version != null && (typeof version !== 'string'||!version.trim()||version.length>200))throw new Error(`${meta.sourceId}: invalid source version metadata`);
  return {id:meta.sourceId,name:meta.sourceName,sections,homepage:meta.homepage,
    mode:meta.canExcerpt ? 'full' : meta.summarizeOnly ? 'summarize' : 'link',...(version?{version}:{})};
}
