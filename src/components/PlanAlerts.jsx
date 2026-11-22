import { useEffect, useMemo, useRef, useState } from 'react';
import './protocolPlan.css';
import { SOURCE_LABELS, doseText, pendingAlerts, findByName, addDaysKey } from '../protocolPlan/plan';

// Opens over the app when the protocol plan has news. Kept short on purpose:
//  - new or revised upcoming items come as ONE list card (name + start date); details live on the Plan tab
//  - an item whose start date arrives is ADDED to the list automatically; its card just confirms it
//    ("OK"), with "Delay start" to push it back (which takes it off the list again until then)
//  - an item ending gets a small card with the one action it needs; the why, what to watch for and the
//    source sit behind "Details"
// "Later" hides a card until the app is next opened.

const fmtShort = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmt = (key) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');

export default function PlanAlerts({ plan, todayKey, stackItems, inputItems, onAddToList, onHideLinked, onOpenPlan }) {
  const [later, setLater] = useState(() => new Set());
  const alerts = useMemo(
    () => pendingAlerts(plan.items, todayKey).filter((a) => !later.has(`${a.type}:${a.item.itemId}`)),
    [plan.items, todayKey, later],
  );
  const isF = (item) => item.kind === 'food' || item.kind === 'intervention';
  const defFor = (item) => {
    const list = isF(item) ? inputItems : stackItems;
    if (item.linked?.id) return (list || []).find((d) => d.id === item.linked.id) || null;
    return findByName(list, item.name);
  };
  // Starts Claude has added to the list this session: their card stays up to confirm it
  const autoAdded = useRef(new Set());
  // An item that starts while it is already on the list (and shown) needs no card: link it quietly
  // so a plan full of things Nate already takes doesn't open with a stack of alerts.
  const quiet = useMemo(() => alerts.filter((a) => {
    if (a.type !== 'start' || a.item.kind === 'test' || autoAdded.current.has(a.item.itemId)) return false;
    const ex = defFor(a.item);
    return ex && ex.active !== false;
  }), [alerts, stackItems, inputItems]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    quiet.forEach(({ item }) => {
      const ex = defFor(item);
      if (!item.linked) plan.link(item.itemId, { kind: isF(item) ? 'factor' : 'supplement', id: ex.id });
      plan.ack(item.itemId, 'start');
    });
  }, [quiet]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every other start: add it (or show it again) now, then confirm on the card
  useEffect(() => {
    alerts.forEach(({ type, item }) => {
      if (type !== 'start' || item.kind === 'test' || autoAdded.current.has(item.itemId) || quiet.some((q) => q.item === item)) return;
      autoAdded.current.add(item.itemId);
      const ex = defFor(item);
      onAddToList(item, ex || undefined, { silent: true });
    });
  }, [alerts, quiet]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = alerts.filter((a) => !quiet.includes(a));
  const [details, setDetails] = useState(false);
  const [delaying, setDelaying] = useState(false);
  const actionable = shown.filter((a) => a.type === 'start' || a.type === 'end');
  const news = shown.filter((a) => a.type === 'added' || a.type === 'updated');
  if (!actionable.length && !news.length) return null;

  // One list card for everything new or revised
  if (!actionable.length) {
    const allUpdated = news.every((a) => a.type === 'updated');
    const ackAll = () => news.forEach(({ item }) => plan.ack(item.itemId, 'added'));
    return (
      <div className="pa" role="dialog" aria-modal="true" aria-label="Plan news">
        <div className="pa-card">
          <div className="pa-top"><span className="pa-type added">{news.length} {allUpdated ? 'updated' : 'new'} in your plan</span></div>
          <ul className="pa-list">
            {news.map(({ type, item }) => (
              <li key={item.itemId}>
                <b>{item.name}</b>
                <span>{type === 'updated' ? 'Updated · ' : ''}{item.startDate ? fmtShort(item.startDate) : ''}{item.condition ? ' · tentative' : ''}</span>
              </li>
            ))}
          </ul>
          <div className="pa-actions">
            <button className="pa-btn primary" onClick={ackAll}>Got it</button>
            {onOpenPlan && <button className="pa-btn" onClick={() => { ackAll(); onOpenPlan(); }}>See the plan</button>}
          </div>
        </div>
      </div>
    );
  }

  const { type, item } = actionable[0];
  const src = item.source || {};
  const isFactor = isF(item);
  const next = () => { setDetails(false); setDelaying(false); };
  const done = () => { plan.ack(item.itemId, type); next(); };
  const snooze = () => { setLater((s) => new Set(s).add(`${type}:${item.itemId}`)); next(); };
  // Delay: move the start in the plan and take it off the list until then (its card comes back on the new date)
  const delay = (days) => {
    autoAdded.current.delete(item.itemId);
    onHideLinked(item, { silent: true });
    plan.editItem(item, { startDate: addDaysKey(todayKey, days) });
    next();
  };
  const notTaking = () => { onHideLinked(item); done(); };

  let primary; let minor;
  if (type === 'start') {
    primary = <button className="pa-btn primary" onClick={done}>OK</button>;
    minor = item.kind === 'test' ? <button onClick={snooze}>Later</button> : <button onClick={() => setDelaying(true)}>Delay start</button>;
  } else {
    primary = item.linked
      ? <button className="pa-btn primary" onClick={() => { onHideLinked(item); done(); }}>Stopped: hide it</button>
      : <button className="pa-btn primary" onClick={done}>Got it</button>;
    minor = <>{<button onClick={snooze}>Later</button>}{item.linked && <button onClick={done}>Keeping it</button>}</>;
  }
  const label = type === 'end' ? 'Time to stop'
    : item.kind === 'test' ? 'Today'
      : `Added to your ${isFactor ? 'factors' : 'supplements'}`;
  const why = type === 'end' ? item.endReason : item.reason;

  return (
    <div className="pa" role="dialog" aria-modal="true" aria-label={label}>
      <div className="pa-card">
        <div className="pa-top">
          <span className={`pa-type ${type}`}>{label}</span>
          {actionable.length > 1 && <span className="pa-count">1 of {actionable.length}</span>}
        </div>
        <h2>{item.name}</h2>
        {doseText(item) && <p className="pa-dose pa-clamp">{doseText(item)}</p>}
        {why && <p className="pa-why pa-clamp">{why}</p>}
        {details ? (
          <div className="pa-more">
            {item.condition && <p className="pp-cond">{item.condition}</p>}
            {item.watchFor && <><h4>{type === 'end' ? 'What to note' : 'Watch for'}</h4><p>{item.watchFor}</p></>}
            {type === 'end' && item.outcome && <p className="pp-muted">Outcome: {item.outcome}</p>}
            <p className="pp-src">
              {SOURCE_LABELS[src.type] || 'Plan'}{src.date ? ` · ${fmt(src.date)}` : ''}
              {src.link && <> · <a href={src.link} target="_blank" rel="noreferrer">open</a></>}
            </p>
          </div>
        ) : (item.watchFor || item.condition || src.link) && (
          <button className="pa-link" onClick={() => setDetails(true)}>Details</button>
        )}
        {delaying ? (
          <div className="pa-delay">
            <p>Start it later instead:</p>
            <div className="pa-delay-opts">
              <button onClick={() => delay(3)}>3 days</button>
              <button onClick={() => delay(7)}>1 week</button>
              <button onClick={() => delay(14)}>2 weeks</button>
            </div>
            <div className="pa-minor">
              <button onClick={() => setDelaying(false)}>Back</button>
              <button onClick={notTaking}>Not taking it</button>
            </div>
          </div>
        ) : (
          <div className="pa-actions">
            {primary}
            <div className="pa-minor">{minor}</div>
          </div>
        )}
      </div>
    </div>
  );
}
