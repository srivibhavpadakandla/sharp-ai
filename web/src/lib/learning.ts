export type LearningMode = 'hint' | 'explain' | 'solution' | 'diagnose';
export interface CodeFile {name: string; source: string}
export interface LearningContext {mode: LearningMode; files: CodeFile[]; error?: string; attempt?: string; lesson?: string}
export interface TutorPlan {mode: LearningMode; followUps: string[]; diagnostic?: {title: string; question: string} | null}
export interface EvidenceClaim {claim: string; sources: Array<{n: number; status: 'matched' | 'weak' | 'restricted' | 'missing'; passage: string | null; version: string | null}>}
export const codeError = (files: CodeFile[]): string | null => {
  if (files.length > 6) return 'Attach at most 6 files.';
  if (new Set(files.map((f) => f.name)).size !== files.length) return 'Each attached file needs a different name.';
  if (files.some((f) => !/^[\w .-]{1,100}$/.test(f.name))) return 'Use simple filenames, such as Main.java.';
  return files.reduce((n, f) => n + f.source.length, 0) > 16000 ? 'Attached code is limited to 16,000 characters. Remove a file or shorten the code.' : null;
};
