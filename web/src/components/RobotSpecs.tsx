import { useEffect, useState } from 'react';
import { loadSpecs, saveSpecs, hasSpecs, FIELDS, type RobotSpecs as Specs } from '../lib/specs';
import './robotspecs.css';

/**
 * Compact editor for the robot configuration. Collapsed by default so it never
 * competes with the question box; opens when someone actually wants code that
 * matches their robot.
 */
export default function RobotSpecs({ onChange }: { onChange?: (s: Specs) => void }) {
  const [specs, setSpecs] = useState<Specs>(loadSpecs);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { onChange?.(specs); }, []);

  const update = (key: keyof Specs, value: string) => {
    const next = { ...specs, [key]: value };
    setSpecs(next);
    saveSpecs(next);
    onChange?.(next);
    setSaved(true);
  };

  const filled = FIELDS.filter((f) => (specs[f.key] || '').trim()).length;

  return (
    <div className={`rs${open ? ' rs--open' : ''}`}>
      <button type="button" className="rs__toggle" onClick={() => setOpen((o) => !o)}>
        <span className="rs__dot" data-on={hasSpecs(specs)} />
        {hasSpecs(specs)
          ? `Your robot — ${filled} of ${FIELDS.length} set`
          : 'Tell it about your robot'}
        <span className="rs__chev">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="rs__body">
          <p className="rs__why">
            Generated code will use these names and this hardware instead of
            placeholders. Stored only in this browser — nothing is uploaded and
            there is no account.
          </p>
          {FIELDS.map((f) => (
            <label key={f.key} className="rs__field">
              <span>{f.label}</span>
              <input
                value={specs[f.key] || ''}
                placeholder={f.placeholder}
                onChange={(e) => update(f.key, e.target.value)}
                maxLength={200}
              />
            </label>
          ))}
          <p className="rs__saved">{saved ? 'Saved to this browser.' : ''}</p>
        </div>
      )}
    </div>
  );
}
