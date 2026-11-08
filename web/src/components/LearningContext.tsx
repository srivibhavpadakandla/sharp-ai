import {useEffect, useId, useState} from 'react';
import {codeError, type CodeFile, type LearningContext as Context, type LearningMode} from '../lib/learning';
export default function LearningContext({onChange, disabled = false, resetKey = '', onExplain}: {onExplain?: () => void; onChange: (value: Context) => void; disabled?: boolean; resetKey?: string}) {
  const id = useId();
  const [mode, setMode] = useState<LearningMode>('explain');
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {if (disabled) setOpen(false);}, [disabled]);
  useEffect(() => {setFiles([]); setCode(''); setError(''); setAttempt(''); setNotice('');}, [resetKey]);
  const allFiles = [...files, ...(code ? [{name: 'Pasted.java', source: code}] : [])];
  const validation = codeError(allFiles);
  useEffect(() => {onChange({mode, files: [...files, ...(code ? [{name: 'Pasted.java', source: code}] : [])], error, attempt});}, [mode, files, code, error, attempt, onChange]);
  return <div className="learning-context">
    <label className="learning-mode" htmlFor={`${id}-mode`}>Help me <select id={`${id}-mode`} value={mode} onChange={(e) => setMode(e.target.value as LearningMode)} disabled={disabled}>
      <option value="explain">Understand it</option><option value="hint">With a hint</option><option value="solution">See a worked solution</option><option value="diagnose">Troubleshoot step by step</option>
    </select></label>
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}><summary>Add code or an error {allFiles.length ? `· ${allFiles.length} files` : ''}</summary>
      <p className="context-note">Shared when you send. Attachments stay out of the server cache. Saved replies remain on this browser.</p>
      <label htmlFor={`${id}-files`}>Attach Java or text files · 6 files, 16,000 characters total</label>
      <input id={`${id}-files`} type="file" multiple accept=".java,.txt" disabled={disabled} onChange={async (e) => {
        const input = e.currentTarget; const selected = Array.from(input.files || []);
        try {
          if (selected.some((f) => f.size > 64000)) throw new Error('A file is too large. Attach a smaller example.');
          const next = [...files, ...await Promise.all(selected.map(async (f) => ({name: f.name, source: await f.text()})))];
          const invalid = codeError([...next, ...(code ? [{name: 'Pasted.java', source: code}] : [])]);
          if (invalid) throw new Error(invalid);
          setFiles(next); setNotice('');
        } catch (err) {setNotice(err instanceof Error ? err.message : 'Could not read this file.');} input.value = '';
      }} />
      {files.map((f) => <div className="context-file" key={f.name}><details><summary>{f.name} · {f.source.length.toLocaleString()} characters</summary><pre>{f.source}</pre></details><button type="button" disabled={disabled} aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x.name !== f.name))}>Remove</button></div>)}
      <label htmlFor={`${id}-code`}>Or paste code</label><textarea id={`${id}-code`} value={code} maxLength={16000} rows={5} spellCheck={false} disabled={disabled} onChange={(e) => setCode(e.target.value)} placeholder="The smallest example that shows the problem" />
      <label htmlFor={`${id}-error`}>Exact error or observed behavior</label><textarea id={`${id}-error`} value={error} maxLength={2000} rows={2} disabled={disabled} onChange={(e) => setError(e.target.value)} />
      <label htmlFor={`${id}-attempt`}>What have you tried?</label><textarea id={`${id}-attempt`} value={attempt} maxLength={2000} rows={2} disabled={disabled} onChange={(e) => setAttempt(e.target.value)} />
      {!!allFiles.length && onExplain && <button type="button" className="chat-action" disabled={disabled || !!validation} onClick={() => {setMode('explain'); onExplain();}}>Explain this code</button>}
      {(notice || validation) && <p role="alert">{notice || validation}</p>}
    </details>
  </div>;
}
