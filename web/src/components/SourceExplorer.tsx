import {useEffect, useRef, useState} from 'react';
import {API_BASE} from '../lib/config';
import {accessLabel, parseCorpus, parseSourceResults, safeSourceUrl, type CorpusSnapshot, type SourceResult} from '../lib/source-explorer';
import './source-explorer.css';

export default function SourceExplorer({snapshot}: {snapshot: CorpusSnapshot}) {
  const [corpus, setCorpus] = useState(snapshot);
  const [live, setLive] = useState<'loading' | 'live' | 'snapshot'>('loading');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [results, setResults] = useState<SourceResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keywordOnly, setKeywordOnly] = useState(false);
  const [confident, setConfident] = useState(true);
  const request = useRef<AbortController | null>(null);
  const initialized = useRef(false);
  const search = async (text: string, filter: string) => {
    request.current?.abort();
    const q = text.trim();
    if (!q) {setResults([]); setSearched(false); setError(''); setBusy(false); return;}
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setSearched(true); setResults([]); setKeywordOnly(false);
    const params = new URLSearchParams({q}); if (filter) params.set('source', filter);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    try {
      const response = await fetch(`${API_BASE}/api/search?${params}`, {signal: controller.signal});
      if (!response.ok) throw new Error(response.status === 400 ? 'Choose an indexed source and try again.' : 'Source search is unavailable right now. Try again.');
      const body = await response.json();
      const rows = parseSourceResults(body, filter);
      if (controller.signal.aborted) return;
      setResults(rows); setKeywordOnly(body.stats?.semanticFailed === true); setConfident(body.gate?.pass !== false);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not search sources. Check your connection and try again.');
    } finally {if (request.current === controller) setBusy(false);}
  };
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/corpus`, {signal: controller.signal}).then(async (r) => {if (!r.ok) throw new Error(); return r.json();}).then((body) => {
      const latest = parseCorpus(body); if (!latest) throw new Error(); setCorpus(latest); setLive('live');
    }).catch(() => {if (!controller.signal.aborted) setLive('snapshot');});
    const params = new URLSearchParams(window.location.search);
    const initialQuery = (params.get('q') || '').slice(0, 500);
    const candidate = params.get('source') || '';
    const initialSource = snapshot.sources.some((s) => s.id === candidate) ? candidate : '';
    setQuery(initialQuery); setSource(initialSource);
    if (initialQuery) void search(initialQuery, initialSource);
    return () => {controller.abort(); request.current?.abort();};
  }, []);
  const selected = corpus.sources.find((s) => s.id === source);
  return <div className="source-explorer">
    <header className="source-explorer__intro"><p className="eyebrow">Source notebook</p><h1>Read the evidence.<br /><em>Know its limits.</em></h1>
      <p>Search the documentation directly, compare indexed versions, and see which sources provide full text, summaries, or links.</p>
      <div className="source-explorer__snapshot" role="status"><span>{corpus.sections.toLocaleString()} sections · {corpus.sources.length} sources</span><span>Indexed {corpus.updatedAt}</span><span>SDK {corpus.sdkVersion} · Manual {corpus.manualVersion}</span></div>
      <p className="source-explorer__note">{live === 'live' ? 'Coverage read from the live service. The index is a snapshot, not a guarantee that every source is current.' : live === 'snapshot' ? 'Live coverage is unavailable. Showing the snapshot bundled with this page.' : 'Checking live coverage…'}</p>
    </header>
    <form className="source-explorer__search" onSubmit={(event) => {event.preventDefault(); void search(query, source);}}>
      <div><label htmlFor="source-query">Search documentation</label><input id="source-query" maxLength={500} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try motor direction, encoder reset, or a rule number" /></div>
      <div><label htmlFor="source-filter">Source</label><select id="source-filter" value={source} onChange={(e) => {setSource(e.target.value); void search(query, e.target.value);}}><option value="">All indexed sources</option>{corpus.sources.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></div>
      <button type="submit" disabled={!query.trim()}>{busy ? 'Search again' : 'Search sources'} <span aria-hidden="true">↗</span></button>
    </form>
    {selected && <div className="source-explorer__selection"><strong>{selected.name}</strong><span>{selected.sections.toLocaleString()} indexed sections · {accessLabel(selected.mode)}</span>{safeSourceUrl(selected.homepage) && <a href={selected.homepage} target="_blank" rel="noopener noreferrer">Open original site ↗</a>}</div>}
    {error && <p className="source-explorer__error" role="alert">{error} <button type="button" onClick={() => void search(query, source)}>Retry search</button></p>}
    <div aria-live="polite" aria-busy={busy} className="source-explorer__results">
      {busy && <p className="source-explorer__note" role="status">Finding matching documentation sections…</p>}
      {keywordOnly && <p className="source-explorer__note">Semantic search is unavailable. These results are keyword matches from the selected source.</p>}
      {searched && !busy && !error && <h2>{results.length ? `${results.length} ${confident ? 'matching' : 'closest indexed'} sections` : 'No matching sections'}</h2>}
      {searched && !busy && !error && results.length > 0 && !confident && <p className="source-explorer__note">No confident match was found. These are the closest candidates, and may not answer your question.</p>}
      {searched && !busy && !error && !results.length && <p>Try fewer terms or choose all sources. A source can have link records without searchable body text.</p>}
      {!busy && results.map((r, i) => <article className="source-result" key={r.chunkId}><div className="source-result__index">{String(i + 1).padStart(2, '0')}</div><div>
        <p className="source-result__meta">{r.sourceName} · {r.version}</p><h3>{r.sectionTitle || r.pageTitle}</h3><p className="source-result__path">{r.headingPath}</p>
        {r.text ? <details><summary>Read indexed passage</summary><pre>{r.text}</pre></details> : <p className="source-result__restriction">{r.mode === 'summarize' ? 'Indexed for paraphrased answers. Original text is not reproduced here.' : 'Only page titles and links are indexed; this record does not contain the original body text.'}</p>}
        <p className="source-result__license">{r.license}</p><div className="source-result__links">{r.url && <a href={r.url} target="_blank" rel="noopener noreferrer">Read original section ↗</a>}<a href={`/ask/?q=${encodeURIComponent(`Explain ${r.sectionTitle || r.pageTitle} in ${r.sourceName}.`)}`}>Ask about this topic ↗</a></div>
      </div></article>)}
    </div>
    {!searched && <section className="source-directory"><div><p className="eyebrow">Coverage directory</p><h2>What can Sharp AI read?</h2><p>Choose a source to narrow your search. Rules and library APIs should be checked against the version installed on your robot and the latest official manual.</p></div><div className="source-directory__list">{corpus.sources.map((s) => <button type="button" key={s.id} aria-pressed={source === s.id} onClick={() => {setSource(s.id); document.getElementById('source-query')?.focus();}}><span>{s.name}<small>{accessLabel(s.mode)}</small></span><strong>{s.sections.toLocaleString()}<small>sections</small></strong></button>)}</div></section>}
  </div>;
}
