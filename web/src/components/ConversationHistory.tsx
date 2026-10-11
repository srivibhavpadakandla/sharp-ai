import { useState } from 'react';
import type { Conversation } from '../lib/conversations';

export default function ConversationHistory({ items, activeId, busy, onSelect, onDelete, onClose }: {
  items: Conversation[]; activeId: string; busy: boolean;
  onSelect: (item: Conversation) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = items.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  return <aside className="conversation-history" aria-label="Saved conversations">
    <header><h2>Your conversations</h2><button type="button" onClick={onClose} aria-label="Close history">×</button></header>
    <p className="history-note">Stored on this browser, without an account.</p>
    <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a conversation" aria-label="Find a conversation" />
    <div className="history-list">
      {filtered.map((c) => <div className={`history-item${c.id === activeId ? ' is-active' : ''}`} key={c.id}>
        <button type="button" disabled={busy} onClick={() => onSelect(c)}>
          <span>{c.title}</span><small>{c.turns.length} {c.turns.length === 1 ? 'question' : 'questions'}</small>
        </button>
        <button className="history-delete" type="button" disabled={busy} aria-label={`Delete ${c.title}`} onClick={() => {
          if (window.confirm('Delete this conversation from this browser?')) onDelete(c.id);
        }}>×</button>
      </div>)}
      {!filtered.length && <p className="history-note">{items.length ? 'No matching conversations.' : 'Your next conversation will appear here.'}</p>}
    </div>
    <p className="history-note">Up to 30 conversations, 200 questions each. General engineering reasoning is not saved.</p>
  </aside>;
}
