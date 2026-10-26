// Adding a supplement or a symptom, one question per screen, full screen. Opened from the + in
// the bottom bar and from Home's "Add …" buttons.
//
// Supplement: name → dose → when → review. Symptom: name → kind and group.
// Typing a name that is already on the list (or hidden from it) offers that item instead of a
// duplicate. Nothing is written until the last screen's button; closing early leaves no trace.
// The records written are the same shape the edit lists always wrote.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDateKey } from '../utils/helpers';
import { createHistoryEntry } from '../utils/helpers';
import { makeId } from '../utils/listHelpers';
import { applySupplementPatch } from '../utils/protocolHistory';
import { matchSupplementCategory } from '../utils/supplementLookup';
import { createSymptomHistoryEntry, applySymptomPatch } from '../utils/symptomHistory';
import { suggestGroup, groupNames, availableGroups, nextGroupOrder } from '../utils/symptomGroups';
import { WELLBEING } from '../utils/wellbeing';
import { isDeleted } from '../utils/softDelete';
import { TIMES, timeLabel } from '../utils/timeOfDay';
import { formatSchedule } from './SchedulePicker';
import { useRiseIn } from './overlay';
import './flow.css';

export const UNITS = ['mg', 'mcg', 'g', 'IU', 'ml', 'drops', 'caps'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DECAY = [
  { value: '', label: 'Auto' },
  { value: 'fast', label: 'Fast, about 12 hours' },
  { value: 'moderate', label: 'Moderate, about 3 days' },
  { value: 'slow', label: 'Slow, about 21 days' },
];

// The +/− step for a dose: coarse for big numbers, fine for small ones
export const doseStep = (d) => (d >= 1000 ? 250 : d >= 100 ? 50 : d >= 10 ? 5 : d >= 2 ? 1 : 0.5);
// Where + starts from an empty dose, by unit
const FIRST_DOSE = { mg: 100, mcg: 100, g: 1, IU: 1000, ml: 1, drops: 1, caps: 1 };
export const scheduleText = (s) => formatSchedule(s) || 'Every day';

export const Back = ({ onClick, close }) => (
  <button type="button" className="fl-x" aria-label={close ? 'Close' : 'Back'} onClick={onClick}>
    {close
      ? <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
      : <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>}
  </button>
);

export function DosePicker({ dose, setDose, unit, setUnit }) {
  const n = parseFloat(dose) || 0;
  const step = (dir) => {
    if (!n && dir > 0) return setDose(String(FIRST_DOSE[unit] || 1));
    const s = doseStep(dir < 0 ? Math.max(0, n - 0.01) : n);
    setDose(String(Math.max(0, Math.round((n + dir * s) * 100) / 100)));
  };
  return (
    <>
      <div className="fl-dose">
        <button type="button" className="fl-pm" aria-label="Less" onClick={() => step(-1)}>−</button>
        <div>
          <input className="fl-num" inputMode="decimal" aria-label="Dose" value={dose}
            onChange={(e) => setDose(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} />
          <div className="fl-unit">{unit}</div>
        </div>
        <button type="button" className="fl-pm" aria-label="More" onClick={() => step(1)}>+</button>
      </div>
      <div className="fl-chips center">
        {UNITS.map((u) => <button key={u} type="button" className={u === unit ? 'on' : ''} onClick={() => setUnit(u)}>{u}</button>)}
      </div>
    </>
  );
}

export function WhenPicker({ schedule, setSchedule, time, setTime }) {
  const type = schedule.type || 'daily';
  const pick = (t) => setSchedule({ ...schedule, type: t, days: schedule.days || [1, 3, 5], interval: schedule.interval || 2 });
  const toggleDay = (d) => {
    const days = schedule.days || [];
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    if (next.length) setSchedule({ ...schedule, days: next });
  };
  const interval = schedule.interval || 2;
  return (
    <>
      <div className="fl-opts">
        {[['daily', 'Every day'], ['days', 'Some days of the week'], ['interval', 'Every few days']].map(([t, label]) => (
          <button key={t} type="button" className={type === t ? 'on' : ''} aria-pressed={type === t} onClick={() => pick(t)}><i />{label}</button>
        ))}
      </div>
      {type === 'days' && (
        <div className="fl-days">
          {DAY_LETTERS.map((l, i) => (
            <button key={i} type="button" aria-label={DAY_NAMES[i]} className={schedule.days?.includes(i) ? 'on' : ''} onClick={() => toggleDay(i)}>{l}</button>
          ))}
        </div>
      )}
      {type === 'interval' && (
        <div className="fl-every">
          <span>Every</span>
          <button type="button" aria-label="Fewer days" disabled={interval <= 2} onClick={() => setSchedule({ ...schedule, interval: interval - 1 })}>−</button>
          <b>{interval}</b>
          <button type="button" aria-label="More days" disabled={interval >= 30} onClick={() => setSchedule({ ...schedule, interval: interval + 1 })}>+</button>
          <span>days</span>
        </div>
      )}
      <div className="fl-lbl">TIME OF DAY</div>
      <div className="fl-times">
        {TIMES.map((t) => (
          <button key={t.id} type="button" className={time === t.id ? 'on' : ''} aria-pressed={time === t.id} onClick={() => setTime(time === t.id ? null : t.id)}>{t.label}</button>
        ))}
      </div>
      <p className="fl-hint">Optional. Groups your list so the evening pills sit together.</p>
    </>
  );
}

export default function AddFlow({ kind, stackItems, setStackItems, symptoms, setSymptoms, setLastAction, onClose }) {
  const rootRef = useRef(null);
  useRiseIn(rootRef);
  const isSupp = kind === 'supplement';
  const steps = isSupp ? 4 : 2;
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [unit, setUnit] = useState('mg');
  const [schedule, setSchedule] = useState({ type: 'daily' });
  const [time, setTime] = useState(null);
  const [note, setNote] = useState('');
  const [decay, setDecay] = useState(null);   // null: follow the name's lookup
  const [wellbeing, setWellbeing] = useState(false);
  const [group, setGroup] = useState(undefined);   // undefined: the suggestion; null: none
  const [newGroup, setNewGroup] = useState(null);  // string while naming one

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = (isSupp ? stackItems : symptoms).filter((i) => !isDeleted(i));
  const trimmed = name.trim();
  const exact = list.find((i) => i.name.toLowerCase() === trimmed.toLowerCase());
  const matches = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (q.length < 2) return [];
    return list.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 4);
  }, [trimmed, list]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoDecay = isSupp ? matchSupplementCategory(trimmed) || null : null;
  const groups = availableGroups(symptoms);
  const suggested = !isSupp && !wellbeing ? suggestGroup(trimmed, '', groups) : null;
  const chosenGroup = wellbeing ? null : group === undefined ? suggested : group;

  const bringBack = (item) => {
    if (isSupp) setStackItems((prev) => prev.map((i) => (i.id === item.id ? applySupplementPatch(i, { active: true }) : i)));
    else setSymptoms((prev) => prev.map((s) => (s.id === item.id ? applySymptomPatch(s, { active: true }) : s)));
    setLastAction(`Brought back ${item.name}`);
    onClose();
  };

  const addSupplement = () => {
    const order = Math.max(-1, ...stackItems.map((i) => i.order || 0)) + 1;
    const startDate = getDateKey(new Date());
    const s = schedule.type === 'days' ? { type: 'days', days: schedule.days, startDate }
      : schedule.type === 'interval' ? { type: 'interval', interval: schedule.interval, startDate }
      : { type: 'daily', startDate };
    const item = {
      id: makeId(trimmed), name: trimmed, unit, defaultDose: parseFloat(dose) || 0, description: note.trim(),
      schedule: s, halfLifeCategory: decay ?? autoDecay, active: true, order,
      ...(time ? { timeOfDay: time } : {}),
    };
    item.history = [createHistoryEntry(item)];
    setStackItems((prev) => [...prev, item]);
    setLastAction(`Added ${item.name}`);
    onClose();
  };

  const addSymptom = () => {
    const order = Math.max(-1, ...symptoms.filter((s) => s.active).map((s) => s.order || 0)) + 1;
    const symptom = { id: makeId(trimmed), name: trimmed, active: true, order, ...(wellbeing ? { kind: WELLBEING } : {}) };
    if (chosenGroup) {
      const member = symptoms.find((s) => s.group === chosenGroup && typeof s.groupOrder === 'number');
      symptom.group = chosenGroup;
      symptom.groupOrder = member ? member.groupOrder : nextGroupOrder(symptoms);
    }
    symptom.history = [createSymptomHistoryEntry(symptom)];
    setSymptoms((prev) => [...prev, symptom]);
    setLastAction(chosenGroup ? `Added ${symptom.name} to ${chosenGroup}` : `Added ${symptom.name}`);
    onClose();
  };

  const last = step === steps - 1;
  const canNext = step > 0 || (trimmed && !(exact && exact.active));
  const next = () => {
    if (!canNext) return;
    if (step === 0 && exact && !exact.active) return bringBack(exact);
    if (!last) return setStep(step + 1);
    if (isSupp) addSupplement(); else addSymptom();
  };
  const nextLabel = step === 0 && exact && !exact.active ? `Bring back ${exact.name}`
    : last ? (isSupp ? 'Add to protocol' : 'Add to tracking') : 'Next';

  const summary = (item) => isSupp
    ? `${item.defaultDose || ''} ${item.defaultDose ? item.unit : ''}${item.defaultDose ? ' · ' : ''}${scheduleText(item.schedule)}`
    : item.group || (item.kind === WELLBEING ? 'Wellbeing' : 'Symptom');

  return (
    <div className={`fl ${isSupp ? '' : 'sym'}`} ref={rootRef} role="dialog" aria-label={isSupp ? 'Add supplement' : 'Add symptom'}>
      <div className="fl-in">
        <div className="fl-top">
          <Back close={step === 0} onClick={step === 0 ? onClose : () => setStep(step - 1)} />
          <div className="fl-bars">{Array.from({ length: steps }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        </div>

        <div className="fl-body">
          {step === 0 && (
            <>
              <h1>{isSupp ? 'What are you adding?' : 'What do you want to track?'}</h1>
              <label className="fl-label" htmlFor="fl-name">{isSupp ? 'Supplement name' : 'Symptom name'}</label>
              <input id="fl-name" className="fl-input big" autoFocus autoComplete="off" value={name}
                placeholder={isSupp ? 'e.g. Magnesium glycinate' : 'e.g. Brain fog'}
                onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') next(); }} />
              {matches.length > 0 && (
                <>
                  <div className="fl-lbl">ALREADY IN YOUR LISTS</div>
                  {matches.map((m) => (
                    <div key={m.id} className="fl-match">
                      <span>{m.name}<small>{m.active ? 'On your list' : 'Hidden'} · {summary(m)}</small></span>
                      {!m.active && <button type="button" onClick={() => bringBack(m)}>Bring back</button>}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {isSupp && step === 1 && (
            <>
              <h1>How much?</h1>
              <p className="fl-sub">{trimmed}, each time</p>
              <DosePicker dose={dose} setDose={setDose} unit={unit} setUnit={setUnit} />
            </>
          )}

          {isSupp && step === 2 && (
            <>
              <h1>When do you take it?</h1>
              <WhenPicker schedule={schedule} setSchedule={setSchedule} time={time} setTime={setTime} />
            </>
          )}

          {isSupp && step === 3 && (
            <>
              <p className="fl-sub" style={{ marginTop: 26 }}>Ready to add</p>
              <h1 style={{ marginTop: 4 }}>{trimmed}</h1>
              <button type="button" className="fl-field" onClick={() => setStep(1)}><span>Dose</span><b>{parseFloat(dose) ? `${parseFloat(dose)} ${unit}` : 'No set dose'}</b><i /></button>
              <button type="button" className="fl-field" onClick={() => setStep(2)}><span>When</span><b>{scheduleText(schedule)}{time ? ` · ${timeLabel(time)}` : ''}</b><i /></button>
              <label className="fl-field">
                <span>Decay rate</span>
                <select value={decay ?? ''} onChange={(e) => setDecay(e.target.value || null)}>
                  {DECAY.map((d) => <option key={d.value} value={d.value}>{d.value ? d.label : `Auto (${autoDecay || 'moderate'})`}</option>)}
                </select>
              </label>
              <label className="fl-label" htmlFor="fl-note" style={{ marginTop: 22 }}>Note (optional)</label>
              <input id="fl-note" className="fl-input" value={note} placeholder="e.g. with dinner, for sleep" onChange={(e) => setNote(e.target.value)} />
            </>
          )}

          {!isSupp && step === 1 && (
            <>
              <p className="fl-sub" style={{ marginTop: 26 }}>Adding</p>
              <h1 style={{ marginTop: 4 }}>{trimmed}</h1>
              <div className="fl-lbl">WHAT KIND</div>
              <div className="fl-kinds">
                <button type="button" className={!wellbeing ? 'on' : ''} aria-pressed={!wellbeing} onClick={() => setWellbeing(false)}>Symptom<small>Lower is better.</small></button>
                <button type="button" className={wellbeing ? 'on' : ''} aria-pressed={wellbeing} onClick={() => setWellbeing(true)}>Wellbeing<small>Higher is better, like energy or mood.</small></button>
              </div>
              {!wellbeing && (
                <>
                  <div className="fl-lbl">GROUP</div>
                  <div className="fl-chips">
                    {[...groups, ...(chosenGroup && !groups.includes(chosenGroup) ? [chosenGroup] : [])].map((g) => (
                      <button key={g} type="button" className={chosenGroup === g ? 'on' : ''} onClick={() => setGroup(chosenGroup === g ? null : g)}>{g}</button>
                    ))}
                    {newGroup === null
                      ? <button type="button" className="add" onClick={() => setNewGroup('')}>+ New group</button>
                      : <input className="fl-input chip" autoFocus value={newGroup} placeholder="Group name" onChange={(e) => setNewGroup(e.target.value)}
                          onBlur={() => { const g = newGroup.trim(); if (g) setGroup(groups.find((x) => x.toLowerCase() === g.toLowerCase()) || g); setNewGroup(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />}
                  </div>
                  <p className="fl-hint">{suggested && group === undefined ? 'Suggested from the name. ' : ''}{groupNames(symptoms).length ? 'Change it any time.' : 'Groups are optional.'}</p>
                </>
              )}
            </>
          )}
        </div>

        <div className="fl-foot">
          {isSupp && step === 1 && <button type="button" className="fl-skip" onClick={() => { setDose(''); setStep(2); }}>No set dose, skip</button>}
          {step === 0 && exact?.active && <p className="fl-hint" style={{ textAlign: 'center' }}>{exact.name} is already on your list.</p>}
          <button type="button" className="fl-next" disabled={!canNext} onClick={next}>{nextLabel}</button>
        </div>
      </div>
    </div>
  );
}
