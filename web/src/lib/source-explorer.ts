export interface IndexedSource {id: string; name: string; sections: number; homepage: string; mode: 'full' | 'summarize' | 'link'}
export interface CorpusSnapshot {updatedAt: string; sections: number; sdkVersion: string; manualVersion: string; sources: IndexedSource[]}
export interface SourceResult {chunkId: string; sourceId: string; sourceName: string; pageTitle: string; sectionTitle: string; headingPath: string; url: string; version: string; mode: IndexedSource['mode']; license: string; text: string | null}
export const safeSourceUrl = (value: unknown): string | null => typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
export const accessLabel = (mode: IndexedSource['mode']) => mode === 'full' ? 'Cited excerpts' : mode === 'summarize' ? 'Paraphrased answers' : 'Titles and links';
export function parseCorpus(value: any): CorpusSnapshot | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.updatedAt) || !Number.isInteger(value.sections) || value.sections < 1 || !Array.isArray(value.sources)) return null;
  const sources = value.sources.filter((s: any) => s && typeof s.id === 'string' && typeof s.name === 'string' && Number.isInteger(s.sections) && s.sections > 0 && safeSourceUrl(s.homepage) && ['full','summarize','link'].includes(s.mode));
  if (!sources.length || sources.length !== value.sources.length) return null;
  return {updatedAt: value.updatedAt, sections: value.sections, sdkVersion: String(value.sdkVersion || 'Unspecified'), manualVersion: String(value.manualVersion || 'Unspecified'), sources};
}
export function parseSourceResults(value: any, source: string): SourceResult[] {
  if (!value || !Array.isArray(value.results) || (source && value.source !== source)) throw new Error('The source search response did not match the selected source. Try again.');
  return value.results.filter((r: any) => r && typeof r.chunkId === 'string' && typeof r.sourceId === 'string' && (!source || r.sourceId === source)).slice(0, 48).map((r: any) => ({
    chunkId: r.chunkId, sourceId: r.sourceId, sourceName: String(r.sourceName || ''), pageTitle: String(r.pageTitle || ''), sectionTitle: String(r.sectionTitle || ''), headingPath: String(r.headingPath || ''), url: safeSourceUrl(r.url) || '', version: String(r.version || 'Version not specified by index'),
    mode: r.mode === 'full' && r.canExcerpt === true ? 'full' : r.mode === 'summarize' ? 'summarize' : 'link', license: String(r.license || ''),
    text: r.mode === 'full' && r.canExcerpt === true && typeof r.text === 'string' ? r.text : null,
  }));
}
