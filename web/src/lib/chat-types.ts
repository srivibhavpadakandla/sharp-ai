import type {TutorPlan, EvidenceClaim} from './learning';
import type { Citation, Excerpt, Validation, CiteCheck } from './ask';

export type Status = 'thinking' | 'streaming' | 'done' | 'refused' | 'error' | 'stopped';
export interface Agent {
  escalated: boolean; queries: string[] | null;
  interpretation: string | null; reranked: boolean;
}
export interface Turn {
  id: number; question: string; answer: string; beyond: string;
  citations: Citation[]; excerpts: Excerpt[]; status: Status;
  agent: Agent | null; slug: string | null; notice: string | null; error: string | null;
  validation: Validation | null; citecheck: CiteCheck | null;
  tutor?: TutorPlan; evidence?: EvidenceClaim[];
  rated: 'up' | 'down' | null; reason?: string;
}
export interface SeedTurn {
  question: string; answerMd: string; citations: Citation[]; excerpts: Excerpt[]; slug: string | null;
}
export const blankTurn = (id: number, question: string): Turn => ({
  id, question, answer: '', beyond: '', citations: [], excerpts: [], status: 'thinking',
  agent: null, slug: null, notice: null, error: null, validation: null, citecheck: null, rated: null,
});
