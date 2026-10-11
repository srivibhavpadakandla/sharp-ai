import { blankTurn, type Turn } from './chat-types.ts';

const KEY = 'sharp-conversations-v1';
const MAX_CONVERSATIONS = 30;
export interface Conversation { id: string; title: string; updatedAt: string; turns: Turn[] }

const short = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';

/** Browser storage is an input boundary. Only known fields survive a restore. */
export function parseConversations(raw: string | null): Conversation[] {
  try {
    if (raw && raw.length > 3_000_000) return [];
    const input: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(input)) return [];
    return input.slice(0, MAX_CONVERSATIONS).flatMap((item) => {
      if (!item || typeof item.id !== 'string' || !Array.isArray(item.turns)) return [];
      const turns: Turn[] = item.turns.slice(0, 200).flatMap((t: any, i: number) => {
        if (!t || typeof t.question !== 'string') return [];
        const citations = Array.isArray(t.citations) ? t.citations.slice(0, 48).filter((c: any) =>
          c && Number.isInteger(c.n) && c.n > 0 && c.n <= 48 && typeof c.chunkId === 'string'
          && typeof c.sourceName === 'string' && typeof c.sourceId === 'string'
          && typeof c.headingPath === 'string' && /^https?:\/\//.test(c.url),
        ).map((c: any) => ({
          n: c.n, chunkId: short(c.chunkId, 100), sourceId: short(c.sourceId, 100),
          sourceName: short(c.sourceName, 200), pageTitle: short(c.pageTitle, 300),
          sectionTitle: short(c.sectionTitle, 300), headingPath: short(c.headingPath, 600),
          url: short(c.url, 2000), license: short(c.license, 200), canExcerpt: c.canExcerpt === true,
          mode: c.mode === 'summarize' ? 'summarize' as const : c.canExcerpt === true ? 'full' as const : 'link' as const,
        })) : [];
        return [{
          ...blankTurn(i, short(t.question, 500)), answer: short(t.answer, 60000), citations,
          excerpts: Array.isArray(t.excerpts) ? t.excerpts.slice(0, 48).flatMap((e: any) => {
            const citation = citations.find((c: any) => c.chunkId === e?.chunkId && c.canExcerpt);
            return citation ? [{ chunkId: citation.chunkId, n: citation.n, text: short(e.text, 12000) }] : [];
          }) : [],
          status: ['done', 'refused', 'error', 'stopped'].includes(t.status) ? t.status : 'stopped',
          error: short(t.error, 500) || null, notice: short(t.notice, 500) || null,
        }];
      });
      if (!turns.length) return [];
      return [{ id: short(item.id, 100), title: short(item.title, 80) || turns[0].question.slice(0, 80),
        updatedAt: short(item.updatedAt, 40), turns }];
    });
  } catch { return []; }
}

export function loadConversations(): Conversation[] {
  try { return parseConversations(localStorage.getItem(KEY)); } catch { return []; }
}

export function saveConversations(items: Conversation[]): boolean {
  try {
    if (items.some((c) => c.turns.length > 200)) return false;
    // Only grounded answers are retained. The general reasoning half stays ephemeral.
    const safe = items.slice(0, MAX_CONVERSATIONS).map((c) => ({ ...c, turns: c.turns.map((t) => ({
      id: t.id, question: t.question, answer: t.answer, citations: t.citations, excerpts: t.excerpts,
      status: t.status, error: t.error, notice: t.notice,
    })) }));
    const raw = JSON.stringify(safe);
    if (raw.length > 3_000_000) return false;
    localStorage.setItem(KEY, raw);
    return true;
  } catch { return false; }
}

export function answerMarkdown(turn: Turn): string {
  const links = turn.citations.map((c) => `[${c.n}] ${c.sourceName} — ${c.headingPath}\n${c.url}`).join('\n\n');
  return turn.answer + (links ? `\n\nSources\n\n${links}` : '');
}

export function conversationMarkdown(turns: Turn[]): string {
  return '# Sharp AI conversation\n\n' + turns.map((t) => `## ${t.question}\n\n${answerMarkdown(t)}`).join('\n\n---\n\n')
    + '\n\nGenerated answers can be wrong. Verify the linked documentation.\n';
}
