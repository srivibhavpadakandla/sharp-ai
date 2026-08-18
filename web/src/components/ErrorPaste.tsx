import { useState } from 'react';
import './errorpaste.css';

const MAX = 500;

const SAMPLES = [
  {
    label: 'Missing hardware device',
    body: 'java.lang.IllegalArgumentException: Unable to find a hardware device with the name "leftFront"',
  },
  {
    label: 'Null pointer in an OpMode',
    body: 'java.lang.NullPointerException: Attempt to invoke virtual method \'void com.qualcomm.robotcore.hardware.DcMotor.setPower(double)\' on a null object reference',
  },
  {
    label: 'OpMode stuck in a loop',
    body: 'The OpMode was stopped because it took too long to exit: user code is stuck in stop()',
  },
];

export default function ErrorPaste() {
  const [value, setValue] = useState('');

  const submit = () => {
    // The trace is compacted first: line numbers and repeated frames burn the
    // 500-character budget without helping retrieval.
    const compact = value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l, i, arr) => i === 0 || !/^at .*\.(<init>|invoke)/.test(l) || arr.indexOf(l) === i)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, MAX);
    if (!compact) return;
    window.location.href = `/ask?mode=error&q=${encodeURIComponent(compact)}`;
  };

  return (
    <div className="ep__box">
      <textarea
        value={value}
        rows={9}
        spellCheck={false}
        placeholder={'java.lang.IllegalArgumentException: Unable to find a hardware device with the name "leftFront"\n\tat com.qualcomm.robotcore.hardware.HardwareMap.get(HardwareMap.java:...)'}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Paste an FTC SDK stack trace"
      />
      <div className="ep__bar">
        <div className="ep__samples">
          <span>Try:</span>
          {SAMPLES.map((s) => (
            <button key={s.label} type="button" onClick={() => setValue(s.body)}>{s.label}</button>
          ))}
        </div>
        <button className="ep__go" type="button" onClick={submit} disabled={!value.trim()}>
          Explain this error
        </button>
      </div>
    </div>
  );
}
