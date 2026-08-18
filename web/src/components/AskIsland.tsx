import { useEffect, useState } from 'react';
import ChatThread from './ChatThread';

/**
 * /ask is static: the opening question is read from the query string, and the
 * thread lives entirely in the client. The Worker keeps no conversation state.
 */
export default function AskIsland() {
  const [boot, setBoot] = useState<{ q: string; endpoint: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = (params.get('q') || '').trim().slice(0, 500);
    const endpoint = params.get('mode') === 'error' ? '/api/explain-error' : '/api/ask';
    setBoot({ q, endpoint });
    if (q) document.title = `${q.length > 62 ? `${q.slice(0, 62)}\u2026` : q} \u2014 Sharp AI`;
  }, []);

  if (!boot) return <div style={{ minHeight: '60vh' }} />;
  return <ChatThread initialQuestion={boot.q} endpoint={boot.endpoint} />;
}
