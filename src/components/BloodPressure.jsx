// Adding a blood pressure reading: the top and bottom numbers and pulse on big − / + steppers that
// start at the last reading saved, so a typical entry is a few taps. Tap a number to type it
// instead; hold − or + to run.
//
// Up to three cuff readings can go into one entry ("Add another reading"); Save writes their
// average, keeping each reading on the record too. Nothing is written until Save; closing early
// leaves no trace. Opened from Home's Blood pressure bar and from the ⋯ menu on every tab.

import { useEffect, useRef, useState } from 'react';
import { haptic } from '../utils/helpers';
import { MAX_READINGS, averageReadings, bpCategory, clampField, startingReading, lastLine } from '../utils/bloodPressure';
import { CloseButton, useRiseIn, useDragDismiss } from './overlay';
import { useFlowViewport } from './AddFlow';
import './bloodPressure.css';

// One number with − and + either side. A press steps once at once and, held, keeps stepping.
function Stepper({ field, label, value, onChange, small }) {
  const [draft, setDraft] = useState(null);   // the text being typed, while the field has focus
  const hold = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const step = (d) => onChange(clampField(field, valueRef.current + d));
  const stop = () => { clearTimeout(hold.current?.t); clearInterval(hold.current?.i); hold.current = null; };
  useEffect(() => stop, []);
  const press = (d) => ({
    onPointerDown: (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      step(d);
      haptic('light');
      stop();
      hold.current = { t: setTimeout(() => { hold.current.i = setInterval(() => step(d), 70); }, 380) };
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // The pointer press already stepped; a click with no pointer behind it is the keyboard's.
    onClick: (e) => { if (e.detail === 0) step(d); },
  });

  const commit = () => {
    if (draft !== null && draft !== '') onChange(clampField(field, draft));
    setDraft(null);
  };

  return (
    <div className={`bp-step${small ? ' small' : ''}`}>
      <button type="button" className="bp-pm" aria-label={`Lower ${label}`} {...press(-1)}>−</button>
      <label>
        <small>{label}</small>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          aria-label={label}
          value={draft ?? String(value)}
          onFocus={(e) => { setDraft(''); e.target.select(); }}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder={String(value)}
        />
      </label>
      <button type="button" className="bp-pm" aria-label={`Raise ${label}`} {...press(1)}>+</button>
    </div>
  );
}

export default function BloodPressure({ records, onSave, onClose }) {
  const rootRef = useRef(null);
  useRiseIn(rootRef);
  useFlowViewport(rootRef);   // typing a number keeps the panel above the keyboard
  const dragDismiss = useDragDismiss(rootRef, onClose);

  const [taken, setTaken] = useState([]);                       // readings already added
  const [cur, setCur] = useState(() => startingReading(records)); // the one on the steppers
  const set = (field) => (v) => setCur((c) => ({ ...c, [field]: v }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const all = [...taken, cur];
  const avg = averageReadings(all);
  const cat = bpCategory(avg);
  const canAdd = all.length < MAX_READINGS;
  const shown = `${avg.sys}/${avg.dia}`;

  const addAnother = () => {
    // The next cuff reading is usually close to this one, so the steppers keep its numbers.
    setTaken((t) => [...t, cur]);
    haptic('light');
  };
  const removeTaken = (i) => setTaken((t) => t.filter((_, j) => j !== i));
  const save = () => {
    onSave({ sys: avg.sys, dia: avg.dia, pulse: avg.pulse, readings: all });
    onClose();
  };

  const sub = taken.length
    ? `Reading ${all.length} of up to ${MAX_READINGS}`
    : (lastLine(records) || 'Your first reading');

  return (
    <div className="bp" ref={rootRef} role="dialog" aria-label="Blood pressure">
      <div className="bp-in">
        <div className="bp-head ui-drag" {...dragDismiss}>
          <div>
            <h2>Blood pressure</h2>
            <small>{sub}</small>
          </div>
          <CloseButton label="Close blood pressure" onClick={onClose} />
        </div>

        <div className="bp-body">
          {taken.map((r, i) => (
            <div className="bp-taken" key={i}>
              <span className="bp-n">{i + 1}</span>
              <span><b>{r.sys}/{r.dia}</b> · pulse {r.pulse}</span>
              <button type="button" aria-label={`Remove reading ${i + 1}`} onClick={() => removeTaken(i)}>
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ))}

          <div className={`bp-card${taken.length ? ' on' : ''}`}>
            <Stepper field="sys" label="SYS" value={cur.sys} onChange={set('sys')} />
            <hr />
            <Stepper field="dia" label="DIA" value={cur.dia} onChange={set('dia')} />
            <Stepper field="pulse" label="Pulse" value={cur.pulse} onChange={set('pulse')} small />
          </div>

          <div className="bp-sum">
            <span>{taken.length ? <>Average <b>{shown}</b></> : 'This reading'}</span>
            <span className={`bp-cat ${cat.id}`}><i />{cat.label}</span>
          </div>

          {canAdd && (
            <button type="button" className="bp-add" onClick={addAnother}>
              <svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></svg>
              {taken.length ? 'Add a third reading' : 'Add another reading'}
            </button>
          )}
          <button type="button" className="bp-save" onClick={save}>
            {taken.length ? `Save average ${shown}` : `Save ${shown}`}
          </button>
        </div>
      </div>
    </div>
  );
}
