// Adding a supplement, symptom or other factor, one question per screen, full screen. Opened from
// the + in the bottom bar and from Home's "Add …" buttons. kind 'any' (Home's Protocol "Add") asks
// which of the three it is first.
//
// Supplement: name → dose → when → review. Symptom: name → kind and group. Other factor: name → kind, unit, repeat.
// Typing a name close to one already on any list (hidden and deleted ones included, typos
// forgiven) pops up that item with a Bring back button instead of making a duplicate. Nothing is written until the last screen's button; closing early leaves no trace.
// The records written are the same shape the edit lists always wrote.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDateKey } from '../utils/helpers';
import { createHistoryEntry } from '../utils/helpers';
import { makeId } from '../utils/listHelpers';
import { applySupplementPatch, applyInputPatch } from '../utils/protocolHistory';
import { INPUT_CATEGORIES } from '../utils/constants';
import { matchSupplementCategory } from '../utils/supplementLookup';
import { createSymptomHistoryEntry, applySymptomPatch } from '../utils/symptomHistory';
import { suggestGroup, groupNames, availableGroups, nextGroupOrder } from '../utils/symptomGroups';
import { WELLBEING } from '../utils/wellbeing';
import { isDeleted, restoreDeleted } from '../utils/softDelete';
import { findSimilar } from '../utils/fuzzyMatch';
import { FACTOR_LABEL, FACTORS_LABEL } from '../utils/labels';
import { primeKeyboard } from '../utils/primeKeyboard';
import { TIMES, timeLabel } from '../utils/timeOfDay';
import { formatSchedule } from './SchedulePicker';
import { CloseButton, useRiseIn } from './overlay';
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

export const Back = ({ onClick }) => (
  <button type="button" className="fl-x" aria-label="Back" onClick={onClick}>
    <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
  </button>
);

// iOS slides the whole page up when the keyboard opens, dragging a full-screen flow halfway off
// the top. Pin the flow to what is visible instead: its top follows the visual viewport and its
// height shrinks to what the keyboard leaves, so the title stays put and the main button sits
// just above the keyboard. The page underneath is held still while the flow is open.
export function useFlowViewport(ref) {
  useEffect(() => {
    const vv = window.visualViewport, el = ref.current, html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = 'hidden';
    const fit = () => {
      if (!vv || !el) return;
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = 'auto';
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    return () => {
      html.style.overflow = overflow;
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// Props for a text field whose keyboard should move the flow on: Return goes to the next step, and
// so does the check mark above the iOS keyboard, which only blurs the field. A blur that comes
// from tapping something on screen, from leaving the app, or from the field going away is not
// that check mark, so it is left alone.
export function useDoneKey(rootRef) {
  const pressedAt = useRef(0);
  useEffect(() => {
    const el = rootRef.current;
    const mark = () => { pressedAt.current = Date.now(); };
    el?.addEventListener('pointerdown', mark, true);
    return () => el?.removeEventListener('pointerdown', mark, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (go, hint = 'next') => ({
    enterKeyHint: hint,
    onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } },
    onBlur: (e) => {
      const field = e.currentTarget;
      if (Date.now() - pressedAt.current < 700) return;
      setTimeout(() => {
        if (!field.isConnected || !document.hasFocus() || document.activeElement === field) return;
        if (document.activeElement && document.activeElement !== document.body) return;
        go();
      }, 0);
    },
  });
}

// Focus a field once it is on screen, without the browser scrolling to it
export function useFocusOnMount(ref, when = true) {
  useEffect(() => { if (when) ref.current?.focus({ preventScroll: true }); }, [when]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function DosePicker({ dose, setDose, unit, setUnit, inputProps }) {
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
            onChange={(e) => setDose(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} {...inputProps} />
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

const KINDS = [
  { id: 'symptom', label: 'Symptom', hint: 'Something you rate, like brain fog or energy.' },
  { id: 'supplement', label: 'Supplement', hint: 'A pill, powder or drop you take, with a dose.' },
  { id: 'factor', label: FACTOR_LABEL, hint: 'Something you do day to day, like meditation or alcohol.' },
];
const LIST_NAME = { symptom: 'symptom', supplement: 'supplement', factor: FACTORS_LABEL };

export default function AddFlow({ kind: startKind, stackItems, setStackItems, symptoms, setSymptoms, inputItems = [], setInputItems, setLastAction, onClose }) {
  const rootRef = useRef(null);
  const nameRef = useRef(null);
  useRiseIn(rootRef);
  useFlowViewport(rootRef);
  const doneKey = useDoneKey(rootRef);
  const asksKind = startKind === 'any';
  const [kind, setKind] = useState(asksKind ? null : startKind);   // null: on the "What is it?" screen
  const isSupp = kind === 'supplement';
  const isFactor = kind === 'factor';
  const steps = isSupp ? 4 : 2;
  const [step, setStep] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  useFocusOnMount(nameRef, !!kind);
  const [dismissed, setDismissed] = useState('');   // the matches the pop-up was closed on

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
  const [category, setCategory] = useState('activity');
  const [factorUnit, setFactorUnit] = useState('');
  const [repeat, setRepeat] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = isSupp ? stackItems : isFactor ? inputItems : symptoms;
  const trimmed = name.trim();
  // The same name on this kind's list: on it already blocks Next, hidden or deleted turns Next
  // into Bring back.
  const same = list.filter((i) => i.name.toLowerCase() === trimmed.toLowerCase());
  const exact = same.find((i) => !isDeleted(i)) || same[0];
  const exactLive = exact && exact.active && !isDeleted(exact);
  const matches = useMemo(() => findSimilar(trimmed, [
    ['symptom', symptoms], ['supplement', stackItems], ['factor', inputItems],
  ]), [trimmed, symptoms, stackItems, inputItems]);
  const matchKey = matches.map((m) => m.item.id).join('|');
  const showPop = step === 0 && !!kind && trimmed.length >= 3 && matches.length > 0 && matchKey !== dismissed;

  const autoDecay = isSupp ? matchSupplementCategory(trimmed) || null : null;
  const groups = availableGroups(symptoms);
  const suggested = !isSupp && !isFactor && !wellbeing ? suggestGroup(trimmed, '', groups) : null;
  const chosenGroup = wellbeing ? null : group === undefined ? suggested : group;

  const bringBack = (item, itemKind = kind) => {
    const back = (patch) => (i) => (i.id === item.id ? patch(isDeleted(i) ? restoreDeleted(i) : i, { active: true }) : i);
    if (itemKind === 'supplement') setStackItems((prev) => prev.map(back(applySupplementPatch)));
    else if (itemKind === 'factor') setInputItems((prev) => prev.map(back(applyInputPatch)));
    else setSymptoms((prev) => prev.map(back(applySymptomPatch)));
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
    const symptom = { id: makeId(trimmed), name: trimmed, active: true, order, ...(wellbeing ? { kind: WELLBEING } : {}), ...(note.trim() ? { description: note.trim() } : {}) };
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

  const addFactor = () => {
    const order = Math.max(-1, ...inputItems.map((i) => i.order || 0)) + 1;
    const unitText = factorUnit.trim();
    const item = {
      id: makeId(trimmed), name: trimmed, description: note.trim(), category, active: true, order, verdict: null, verdictDate: null,
      ...(unitText ? { unit: unitText } : {}), ...(repeat ? { autoRepeat: true } : {}),
    };
    item.history = [{ timestamp: new Date().toISOString(), type: 'created', snapshot: { name: trimmed, description: item.description, category, active: true, verdict: null } }];
    setInputItems((prev) => [...prev, item]);
    setLastAction(`Added ${item.name}`);
    onClose();
  };

  const last = step === steps - 1;
  const canNext = step > 0 || (trimmed && !exactLive);
  const next = () => {
    if (!canNext) return;
    if (step === 0 && exact && !exactLive) return bringBack(exact);
    if (!last) return setStep(step + 1);
    if (isSupp) addSupplement(); else if (isFactor) addFactor(); else addSymptom();
  };
  const nextFrom = (s) => () => { if (stepRef.current === s) next(); };
  const nextLabel = step === 0 && exact && !exactLive ? `Bring back ${exact.name}`
    : last ? (isSupp || isFactor ? 'Add to protocol' : 'Add to tracking') : 'Next';

  const summary = (m) => {
    const { item } = m;
    const what = m.kind === 'factor' ? `${FACTOR_LABEL} · ${INPUT_CATEGORIES.find((c) => c.id === item.category)?.label || ''}`.replace(/ · $/, '')
      : m.kind === 'supplement' ? `Supplement${item.defaultDose ? ` · ${item.defaultDose} ${item.unit}` : ''}`
      : item.kind === WELLBEING ? 'Wellbeing' : `Symptom${item.group ? ` · ${item.group}` : ''}`;
    return `${what} · ${m.status === 'active' ? 'on your list' : m.status === 'hidden' ? 'hidden' : 'deleted'}`;
  };

  const pickKind = (k) => { primeKeyboard(); setKind(k); setStep(0); };
  const back = () => (step > 0 ? setStep(step - 1) : setKind(null));
  const allSteps = (asksKind ? 1 : 0) + (kind ? steps : 1);
  const at = kind ? (asksKind ? 1 : 0) + step : 0;
  const title = !kind ? 'Add' : isSupp ? 'Add supplement' : isFactor ? `Add ${FACTOR_LABEL.toLowerCase()}` : 'Add symptom';

  return (
    <div className={`fl ${kind && !isSupp && !isFactor ? 'sym' : ''}`} ref={rootRef} role="dialog" aria-label={title}>
      <div className="fl-in">
        <div className="fl-top">
          {(step > 0 || (asksKind && kind)) && <Back onClick={back} />}
          <div className="fl-bars">{Array.from({ length: allSteps }, (_, i) => <i key={i} className={i <= at ? 'on' : ''} />)}</div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="fl-body">
          {!kind && (
            <>
              <h1>What are you adding?</h1>
              <div className="fl-type">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" className={`t-${k.id}`} onClick={() => pickKind(k.id)}>
                    <b>{k.label}</b><small>{k.hint}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {kind && step === 0 && (
            <>
              <h1>{isSupp ? 'Which supplement?' : isFactor ? `Which ${FACTOR_LABEL.toLowerCase()}?` : 'What do you want to track?'}</h1>
              <label className="fl-label" htmlFor="fl-name">{isSupp ? 'Supplement name' : isFactor ? FACTOR_LABEL : 'Symptom name'}</label>
              <input id="fl-name" ref={nameRef} className="fl-input big" autoComplete="off" autoCapitalize="words" value={name}
                placeholder={isSupp ? 'e.g. Magnesium glycinate' : isFactor ? 'e.g. Meditation, Alcohol' : 'e.g. Brain fog'}
                onChange={(e) => setName(e.target.value)} {...doneKey(nextFrom(0))} />
              {showPop && (
                <div className="fl-pop" role="status" key={matches[0].item.id}>
                  <div className="fl-pop-head">
                    <b>Already have {matches.length === 1 ? 'this' : 'one of these'}?</b>
                    <button type="button" aria-label="Not these, keep adding" onClick={() => setDismissed(matchKey)}>
                      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </div>
                  {matches.map((m) => (
                    <div key={`${m.kind}-${m.item.id}`} className="fl-match">
                      <span>{m.item.name}<small>{summary(m)}</small></span>
                      {m.status !== 'active'
                        ? <button type="button" onClick={() => bringBack(m.item, m.kind)}>Bring back</button>
                        : m.kind !== kind && <em>On your {LIST_NAME[m.kind]} list</em>}
                    </div>
                  ))}
                  <button type="button" className="fl-pop-new" onClick={() => setDismissed(matchKey)}>None of these, add {trimmed ? `“${trimmed}”` : 'it'} as new</button>
                </div>
              )}
            </>
          )}

          {isSupp && step === 1 && (
            <>
              <h1>How much?</h1>
              <p className="fl-sub">{trimmed}, each time</p>
              <DosePicker dose={dose} setDose={setDose} unit={unit} setUnit={setUnit} inputProps={doneKey(nextFrom(1))} />
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
              <label className="fl-label" htmlFor="fl-note" style={{ marginTop: 22 }}>Description (optional)</label>
              <input id="fl-note" className="fl-input" value={note} placeholder="e.g. with dinner, for sleep" onChange={(e) => setNote(e.target.value)} enterKeyHint="done" />
              <p className="fl-hint">Shows under the name in your list.</p>
            </>
          )}

          {isFactor && step === 1 && (
            <>
              <p className="fl-sub" style={{ marginTop: 26 }}>Adding</p>
              <h1 style={{ marginTop: 4 }}>{trimmed}</h1>
              <div className="fl-lbl">WHAT KIND</div>
              <div className="fl-chips">
                {INPUT_CATEGORIES.map((c) => <button key={c.id} type="button" className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>{c.label}</button>)}
              </div>
              <div className="fl-lbl">TOMORROW</div>
              <div className="fl-kinds">
                <button type="button" className={repeat ? 'on' : ''} aria-pressed={repeat} onClick={() => setRepeat(true)}>Repeat tomorrow<small>A Yes today is checked tomorrow too, like a daily meditation.</small></button>
                <button type="button" className={!repeat ? 'on' : ''} aria-pressed={!repeat} onClick={() => setRepeat(false)}>Ask fresh<small>Never assumed, like alcohol.</small></button>
              </div>
              <label className="fl-label" htmlFor="fl-unit" style={{ marginTop: 24 }}>Counted in (optional)</label>
              <input id="fl-unit" className="fl-input" value={factorUnit} maxLength={24} placeholder="e.g. drinks, minutes" onChange={(e) => setFactorUnit(e.target.value)} enterKeyHint="done" />
              <label className="fl-label" htmlFor="fl-note" style={{ marginTop: 24 }}>Description (optional)</label>
              <input id="fl-note" className="fl-input" value={note} placeholder="e.g. 10 minutes, morning" onChange={(e) => setNote(e.target.value)} enterKeyHint="done" />
            </>
          )}

          {!isSupp && !isFactor && step === 1 && (
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
              <label className="fl-label" htmlFor="fl-note" style={{ marginTop: 24 }}>Description (optional)</label>
              <input id="fl-note" className="fl-input" value={note} placeholder={wellbeing ? 'e.g. Up for normal activity' : 'e.g. Behind the eyes, throbbing'}
                onChange={(e) => setNote(e.target.value)} enterKeyHint="done" />
              <p className="fl-hint">Shows under the name in your list.</p>
            </>
          )}
        </div>

        <div className="fl-foot">
          {isSupp && step === 1 && <button type="button" className="fl-skip" onClick={() => { setDose(''); setStep(2); }}>No set dose, skip</button>}
          {kind && step === 0 && exactLive && <p className="fl-hint" style={{ textAlign: 'center' }}>{exact.name} is already on your list.</p>}
          {kind && <button type="button" className="fl-next" disabled={!canNext} onClick={next}>{nextLabel}</button>}
        </div>
      </div>
    </div>
  );
}
