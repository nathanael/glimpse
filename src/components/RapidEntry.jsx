import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import './desktopNav.css';
import './rapidEntry.css';
import { CloseButton, useRiseIn, useDragDismiss } from './overlay';
import { severityColors, NA_SEVERITY } from '../utils/constants';
import { getDateKey, getCurrentTimePeriod, formatDate } from '../utils/helpers';
import { getLastSeverity } from '../utils/listHelpers';
import * as queue from '../voice/checkinQueue';
import { isWellbeing, colorIndex, WELLBEING_LABELS } from '../utils/wellbeing';
import WeekStrip from './WeekStrip';
import { solar } from './solarIcons';
import './weekStrip.css';

// Full-screen, one-symptom-at-a-time logging. Rating jumps to the next unlogged symptom;
// finishing a period offers the other one, then closes with confetti.
export default function RapidEntry({
  symptoms, // active symptoms in list order
  entries,
  setEntries,
  selectedDate,
  trackingMode,
  timePeriods,
  quickLog,
  setCopyToastMessage,
  onSelectDate,  // (date): the week strip moves the day being logged
  onAdvanced,    // the Advanced Tracking tab
  onClose,
}) {
  const dateKey = getDateKey(selectedDate);
  const entryKey = (symptom, periodId) => queue.entryKey(dateKey, symptom.id, periodId);
  const listFor = (periodId) => queue.listFor(symptoms, periodId);

  // Start in the current period, or the other one if this one is already complete
  const [period, setPeriod] = useState(() => queue.initialPeriod(symptoms, entries, dateKey, timePeriods, getCurrentTimePeriod(trackingMode)));
  const list = useMemo(() => listFor(period), [symptoms, period]);
  const isLogged = (symptom) => !!entries[entryKey(symptom, period)];

  const [index, setIndex] = useState(() => Math.max(0, list.findIndex((s) => !isLogged(s))));
  const [done, setDone] = useState(() => list.every(isLogged));
  const rootRef = useRef(null);
  useRiseIn(rootRef);
  const dragDismiss = useDragDismiss(rootRef, onClose);
  const current = list[Math.min(index, list.length - 1)];
  const periodLabel = timePeriods.length > 1 ? timePeriods.find((p) => p.id === period)?.label : '';
  const otherIncomplete = queue.otherIncomplete(symptoms, entries, dateKey, timePeriods, period);

  // A new day from the week strip starts that day's queue afresh, as opening Rapid entry on it would.
  const firstDay = useRef(dateKey);
  const quiet = useRef(false);   // an already-finished day arrives done: no confetti for it
  useEffect(() => {
    if (firstDay.current === dateKey) return;
    firstDay.current = dateKey;
    const p = queue.initialPeriod(symptoms, entries, dateKey, timePeriods, getCurrentTimePeriod(trackingMode));
    const l = listFor(p);
    setPeriod(p);
    setIndex(Math.max(0, l.findIndex((s) => !entries[queue.entryKey(dateKey, s.id, p)])));
    quiet.current = true;
    setDone(l.every((s) => !!entries[queue.entryKey(dateKey, s.id, p)]));
  }, [dateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A day's dot: every symptom rated in every period, some, or none.
  const dayStatus = (d) => {
    const k = getDateKey(d);
    let all = 0, n = 0;
    timePeriods.forEach((p) => listFor(p.id).forEach((s) => { all += 1; if (entries[queue.entryKey(k, s.id, p.id)]) n += 1; }));
    return !all || !n ? '' : n === all ? 'full' : 'part';
  };
  const foot = (onSelectDate || onAdvanced) && (
    <div className="re-foot">
      {onSelectDate && <WeekStrip selectedDate={selectedDate} onSelect={onSelectDate} status={dayStatus} />}
      {onAdvanced && (
        <button type="button" className="adv-back" onClick={onAdvanced}>
          <svg viewBox="0 0 24 24">{solar.transfer}</svg>Advanced tracking
        </button>
      )}
    </div>
  );

  useEffect(() => {
    if (done && !quiet.current) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    quiet.current = false;
  }, [done]);

  const switchPeriod = (periodId) => {
    const next = listFor(periodId);
    setPeriod(periodId);
    setIndex(Math.max(0, next.findIndex((s) => !entries[entryKey(s, periodId)])));
    setDone(false);
  };

  // Next unlogged symptom after `from`, wrapping; -1 when everything else is logged
  const nextUnlogged = (from, skipId) => queue.nextUnlogged(list, isLogged, from, skipId);

  const finish = () => {
    if (otherIncomplete) {
      setDone(true);
      return;
    }
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setCopyToastMessage('✓ All logged!');
    setTimeout(() => setCopyToastMessage(''), 3000);
    onClose();
  };

  const rate = (severity) => {
    if (!current) return;
    const key = entryKey(current, period);
    // Tapping the selected value again clears it
    if (entries[key]?.severity === severity) {
      setEntries((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const wasLogged = isLogged(current);
    quickLog(current.id, severity, period);
    if (wasLogged) return; // editing an earlier answer: stay put
    const next = nextUnlogged(index, current.id);
    if (next === -1) finish();
    else setIndex(next);
  };

  const step = (dir) => setIndex((i) => (i + dir + list.length) % list.length);
  const skipToUnlogged = () => {
    const next = nextUnlogged(index);
    if (next === -1) finish();
    else setIndex(next);
  };

  const startOver = () => {
    setEntries((prev) => {
      const next = { ...prev };
      list.forEach((s) => delete next[entryKey(s, period)]);
      return next;
    });
    setIndex(0);
    setDone(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (done) return;
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (/^[0-5]$/.test(e.key)) rate(parseInt(e.key, 10));
      else if (e.key === 'n' || e.key === 'N') rate(NA_SEVERITY);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Most recent earlier rating for this symptom + period, to hint the likely answer
  const lastSeverity = useMemo(
    () => (current ? getLastSeverity(entries, current.id, period, selectedDate) : null),
    [current?.id, period, dateKey, entries]
  );

  const header = (
    <div className="re-bar ui-drag" {...dragDismiss}>
      <h2>Rapid entry</h2>
      {timePeriods.length > 1 && (
        <div className="dn-seg sm">
          {timePeriods.map((p) => (
            <button key={p.id} className={p.id === period ? 'on' : ''} onClick={() => switchPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
      )}
      <CloseButton label="Close rapid entry" onClick={onClose} />
    </div>
  );

  if (done || !current) {
    return (
      <div className="re" ref={rootRef}>
        <div className="re-in">
          {header}
          <div className="re-done">
            <span className="re-check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg></span>
            <h1>All {periodLabel} ratings logged</h1>
            <p>{formatDate(selectedDate)} · {list.length} of {list.length}</p>
            <div className="re-done-actions">
              {otherIncomplete && <button className="dn-btn primary" onClick={() => switchPeriod(otherIncomplete.id)}>Continue to {otherIncomplete.label} · {otherIncomplete.left} left</button>}
              <button className={`dn-btn ${otherIncomplete ? '' : 'primary'}`} onClick={onClose}>Done</button>
              <button className="dn-btn ghost" onClick={startOver}>Start {periodLabel} over</button>
            </div>
          </div>
          {foot && <div className="re-pad">{foot}</div>}
        </div>
      </div>
    );
  }

  const currentSeverity = entries[entryKey(current, period)]?.severity;
  const loggedCount = list.filter(isLogged).length;

  return (
    <div className="re" ref={rootRef}>
      <div className="re-in">
        {header}

        <div className="re-progress">
          <div className="re-count"><span>{formatDate(selectedDate)}{periodLabel && ` · ${periodLabel}`}</span><span><b>{loggedCount}</b> of {list.length} logged</span></div>
          <div className="re-ticks">
            {list.map((s) => {
              const entry = entries[entryKey(s, period)];
              return <i key={s.id} className={s.id === current.id ? 'cur' : entry ? (entry.severity === NA_SEVERITY ? 'na' : 'done') : ''} />;
            })}
          </div>
        </div>

        <div className="re-symptom">
          {isWellbeing(current) && <span className="re-kind">Wellbeing · 0 absent, 5 excellent</span>}
          <h1>{current.name}</h1>
          <p>{current.description}</p>
          {lastSeverity !== null && currentSeverity === undefined && (
            <span className="re-last">Last time <b style={{ color: severityColors[colorIndex(current, lastSeverity)] }}>{lastSeverity}</b></span>
          )}
        </div>

        <div className="re-pad">
          <div className="re-nav">
            <button aria-label="Previous symptom" onClick={() => step(-1)}><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg></button>
            <button aria-label="Next symptom" onClick={() => step(1)}><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg></button>
            <button aria-label="Next unlogged symptom" onClick={skipToUnlogged}>Next unlogged<svg viewBox="0 0 24 24"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg></button>
          </div>
          <div className="re-scores" role="group" aria-label="Score">
          <div className="re-keys">
            {[0, 1, 2, 3, 4, 5].map((severity) => (
              <button
                key={severity}
                className={`re-key ${currentSeverity === severity ? 'on' : lastSeverity === severity && currentSeverity === undefined ? 'last' : ''}`}
                style={{ '--c': severityColors[colorIndex(current, severity)] }}
                title={isWellbeing(current) ? WELLBEING_LABELS[severity] : undefined}
                onClick={() => rate(severity)}
              >
                {severity}
              </button>
            ))}
          </div>
          <button className={`re-key na ${currentSeverity === NA_SEVERITY ? 'on' : ''}`} aria-label="Not applicable right now" onClick={() => rate(NA_SEVERITY)}>
            <b>N/A</b><small>Not applicable right now</small>
          </button>
          </div>
          {foot}
        </div>
      </div>
    </div>
  );
}
