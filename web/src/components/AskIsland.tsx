import { useEffect, useState } from 'react';
import AnswerView from './AnswerView';

/**
 * /ask is a static page: the question is read from the query string on the
 * client, streamed in, and the URL is rewritten to the permanent /q/<slug>
 * once the answer has been persisted.
 */
export default function AskIsland() {
  const [question, setQuestion] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState('/api/ask');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = (params.get('q') || '').trim().slice(0, 500);
    if (params.get('mode') === 'error') setEndpoint('/api/explain-error');
    if (!q) { location.replace('/'); return; }
    setQuestion(q);
    document.title = `${q.length > 62 ? `${q.slice(0, 62)}…` : q} — Sharp AI`;
  }, []);

  if (!question) return <div style={{ minHeight: '60vh' }} />;
  return <AnswerView question={question} endpoint={endpoint} />;
}
