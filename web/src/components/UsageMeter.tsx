import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/config';
import './usage.css';

interface Usage {
  you: { used: number; limit: number; remaining: number };
  pool: { used: number; ceiling: number; remaining: number };
}

/**
 * What is left of today's questions.
 *
 * There are two ceilings and they fail differently: a personal daily cap, and
 * a shared pool that keeps the whole site inside the free tier. Showing only
 * the personal one would leave someone confused when the site says no while
 * their own bar still looks healthy, so the pool appears once it is the
 * tighter of the two.
 */
export default function UsageMeter({ refreshKey = 0 }: { refreshKey?: number }) {
  const [u, setU] = useState<Usage | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/usage`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.you) setU(d); })
      .catch(() => { /* the meter is not worth an error state */ });
    return () => { alive = false; };
  }, [refreshKey]);

  if (!u) return null;

  const pct = Math.min(100, Math.round((u.you.used / Math.max(1, u.you.limit)) * 100));
  const poolPct = Math.min(100, Math.round((u.pool.used / Math.max(1, u.pool.ceiling)) * 100));
  // The pool only matters to a reader once it is the binding constraint.
  const poolTighter = u.pool.remaining <= u.you.remaining;
  const level = pct >= 90 ? 'is-out' : pct >= 70 ? 'is-low' : '';

  return (
    <div className={`usage ${level}`}>
      <div className="usage__bar" role="img"
        aria-label={`${u.you.remaining} of ${u.you.limit} questions left today`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="usage__text">
        {u.you.remaining > 0
          ? <><strong>{u.you.remaining}</strong> of {u.you.limit} questions left today</>
          : <>You have used today&rsquo;s {u.you.limit} questions. They reset at midnight UTC.</>}
        {poolTighter && u.pool.remaining <= 40 && (
          <span className="usage__pool"> · shared pool {u.pool.remaining} left ({poolPct}% used)</span>
        )}
      </p>
    </div>
  );
}
