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
import DayBar from './DayBar';
import { trackingDayStatus } from '../utils/dayStatus';
import { factorKey, isAnswered, isYes, isNo, countOf, noEntry, yesEntry, dailyFactors, factorPeriodId, amountLabel } from '../utils/dailyFactors';

// Full-screen, one-symptom-at-a-time logging. Rating jumps to the next unlogged symptom;
// finishing a period offers the other one, then closes with confetti. Once a day (the last
// period) the active Other factors follow the symptoms: No, or how many.
export default function RapidEntry({
  symptoms, // active symptoms in list order
  entries,
  setEntries,
  selectedDate,
  trackingMode,
  timePeriods,
  quickLog,
  inputItems = [],     // Other factors, asked once a day after the symptoms
  inputEntries = {},
  setInputEntries,
  setCopyToastMessage,
  onSelectDate,  // (date): the day chips move the day being logged
  onAdvanced,    // the switch: the Advanced Tracking list
  onHome,
  instant,       // opened by the switch: no rise-in, it just appears
  onClose,
}) {
  const dateKey = getDateKey(selectedDate);
  const entryKey = (symptom, periodId) => queue.entryKey(dateKey, symptom.id, periodId);
  const factors = useMemo(() => (setInputEntries ? dailyFactors(inputItems) : []), [inputItems, setInputEntries]);
  const factorPeriod = factorPeriodId(timePeriods);
  const prevKey = (() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); return getDateKey(d); })();
  // A factor card answers for its own day (`_day`): today's in the last period, and in the
  // earlier period (AM) yesterday's, for any factor yesterday left unanswered.
  const factorEntry = (item, dk = dateKey) => inputEntries[factorKey(item._day || dk, item.id)];
  const listFor = (periodId) => [
    ...queue.listFor(symptoms, periodId),
    ...(periodId === factorPeriod
      ? factors.map((f) => ({ ...f, _factor: true }))
      : factors.filter((f) => !isAnswered(inputEntries[factorKey(prevKey, f.id)])).map((f) => ({ ...f, _factor: true, _day: prevKey }))),
  ];
  const loggedOn = (item, periodId, dk = dateKey) =>
    item._factor ? isAnswered(factorEntry(item, dk)) : !!entries[queue.entryKey(dk, item.id, periodId)];
  const leftIn = (periodId, dk = dateKey) => listFor(periodId).filter((i) => !loggedOn(i, periodId, dk)).length;
  // Start in the current period, or the first other one with anything left if this one is complete
  const startPeriod = (dk) => {
    const now = timePeriods.find((p) => p.id === getCurrentTimePeriod(trackingMode))?.id || timePeriods[0].id;
    if (leftIn(now, dk) > 0) return now;
    return timePeriods.find((p) => leftIn(p.id, dk) > 0)?.id || now;
  };

  const [period, setPeriod] = useState(() => startPeriod(dateKey));
  const list = useMemo(() => listFor(period), [symptoms, factors, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const isLogged = (item) => loggedOn(item, period);

  const [index, setIndex] = useState(() => Math.max(0, list.findIndex((s) => !isLogged(s))));
  const [done, setDone] = useState(() => list.every(isLogged));
  const rootRef = useRef(null);
  useRiseIn(rootRef, instant);
  const dragDismiss = useDragDismiss(rootRef, onClose);
  const current = list[Math.min(index, list.length - 1)];
  const periodLabel = timePeriods.length > 1 ? timePeriods.find((p) => p.id === period)?.label : '';
  const otherIncomplete = timePeriods
    .filter((p) => p.id !== period)
    .map((p) => ({ ...p, left: leftIn(p.id) }))
    .find((p) => p.left > 0);

  // A new day from the week strip starts that day's queue afresh, as opening Rapid entry on it would.
  const firstDay = useRef(dateKey);
  const quiet = useRef(false);   // an already-finished day arrives done: no confetti for it
  useEffect(() => {
    if (firstDay.current === dateKey) return;
    firstDay.current = dateKey;
    const p = startPeriod(dateKey);
    const l = listFor(p);
    setPeriod(p);
    setIndex(Math.max(0, l.findIndex((s) => !loggedOn(s, p))));
    quiet.current = true;
    setDone(l.every((s) => loggedOn(s, p)));
  }, [dateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const foot = onHome && (
    <div className="re-foot">
      <DayBar
        selectedDate={selectedDate}
        onSelect={onSelectDate}
        status={(d) => trackingDayStatus(symptoms, entries, timePeriods, d)}
        onHome={onHome}
        onSwitch={onAdvanced}
        switchLabel="Advanced tracking"
      />
    </div>
  );

  useEffect(() => {
    if (done && !quiet.current) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    quiet.current = false;
  }, [done]);

  const switchPeriod = (periodId) => {
    const next = listFor(periodId);
    setPeriod(periodId);
    setIndex(Math.max(0, next.findIndex((s) => !loggedOn(s, periodId))));
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

  const advanceFrom = (item) => {
    const next = nextUnlogged(index, item.id);
    if (next === -1) finish();
    else setIndex(next);
  };

  // A factor: 0 is "No", any other number is "Yes, this many". Tapping the chosen answer again clears it.
  const answerFactor = (count) => {
    const item = current;
    const day = item._day || dateKey;
    const key = factorKey(day, item.id);
    const prev = inputEntries[key];
    const same = count === 0 ? isNo(prev) : countOf(prev) === count;
    const wasAnswered = isAnswered(prev);
    setInputEntries((all) => {
      const next = { ...all };
      if (same) delete next[key];
      else next[key] = count === 0 ? noEntry(day, item.id) : yesEntry(day, item.id, count, all[key]);
      return next;
    });
    if (same || wasAnswered) return; // clearing or editing an earlier answer: stay put
    if (count > 5) return;           // "More": stay for the stepper
    advanceFrom(item);
  };

  const rate = (severity) => {
    if (!current) return;
    if (current._factor) return answerFactor(severity === NA_SEVERITY ? 0 : severity);
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
    advanceFrom(current);
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
      list.forEach((s) => { if (!s._factor) delete next[entryKey(s, period)]; });
      return next;
    });
    if (list.some((s) => s._factor)) {
      setInputEntries((prev) => {
        const next = { ...prev };
        list.forEach((f) => { if (f._factor) delete next[factorKey(f._day || dateKey, f.id)]; });
        return next;
      });
    }
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
    () => (current && !current._factor ? getLastSeverity(entries, current.id, period, selectedDate) : null),
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
      {!onHome && <CloseButton label="Close rapid entry" onClick={onClose} />}
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

  const currentSeverity = current._factor ? undefined : entries[entryKey(current, period)]?.severity;
  const currentFactor = current._factor ? factorEntry(current) : undefined;
  const factorCount = countOf(currentFactor);
  const loggedCount = list.filter(isLogged).length;

  return (
    <div className="re" ref={rootRef}>
      <div className="re-in">
        {header}

        <div className="re-progress">
          <div className="re-count"><span>{onHome ? periodLabel : <>{formatDate(selectedDate)}{periodLabel && ` · ${periodLabel}`}</>}</span><span><b>{loggedCount}</b> of {list.length} logged</span></div>
          <div className="re-ticks">
            {list.map((s) => {
              if (s._factor) {
                const fe = factorEntry(s);
                return <i key={`f-${s.id}`} className={s.id === current.id ? 'cur' : isYes(fe) ? 'done' : isNo(fe) ? 'na' : ''} />;
              }
              const entry = entries[entryKey(s, period)];
              return <i key={s.id} className={s.id === current.id ? 'cur' : entry ? (entry.severity === NA_SEVERITY ? 'na' : 'done') : ''} />;
            })}
          </div>
        </div>

        <div className="re-symptom">
          {current._factor && <span className="re-kind factor">{current._day ? 'Yesterday' : 'Today'} · {current.unit ? `how many ${current.unit}?` : 'how many?'}</span>}
          {!current._factor && isWellbeing(current) && <span className="re-kind">Wellbeing · 0 absent, 5 excellent</span>}
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
          {current._factor ? (
          <div className="re-scores" role="group" aria-label="How many">
            <div className="re-keys">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`re-key ${n === 0 ? 'no' : ''} ${(n === 0 ? isNo(currentFactor) : factorCount === n) ? 'on' : ''}`}
                  style={{ '--c': n === 0 ? '#94a3b8' : '#a78bfa' }}
                  onClick={() => answerFactor(n)}
                >
                  {n === 0 ? 'No' : n}
                </button>
              ))}
            </div>
            {factorCount > 5 ? (
              <div className="re-more">
                <button aria-label="Fewer" onClick={() => answerFactor(factorCount - 1)}>−</button>
                <b>{amountLabel(current, factorCount)}</b>
                <button aria-label="More" onClick={() => answerFactor(factorCount + 1)}>+</button>
                <button className="go" onClick={() => advanceFrom(current)}>Next</button>
              </div>
            ) : (
              <button className="re-key na" onClick={() => answerFactor(6)}><b>6+</b><small>More than 5</small></button>
            )}
          </div>
          ) : (
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
          )}
          {foot}
        </div>
      </div>
    </div>
  );
}
