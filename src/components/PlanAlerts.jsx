import { useEffect, useMemo, useState } from 'react';
import './protocolPlan.css';
import { SOURCE_LABELS, doseText, pendingAlerts, findByName } from '../protocolPlan/plan';

// Opens over the app when the protocol plan has news. Kept short on purpose:
//  - new or revised upcoming items come as ONE list card (name + start date); details live on the Plan tab
//  - an item starting or ending gets its own small card with the one action it needs; the why,
//    what to watch for and the source sit behind "Details"
// "Later" hides a card until the app is next opened.

const fmtShort = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmt = (key) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');

export default function PlanAlerts({ plan, todayKey, stackItems, inputItems, onAddToList, onHideLinked, onOpenPlan }) {
  const [later, setLater] = useState(() => new Set());
  const alerts = useMemo(
    () => pendingAlerts(plan.items, todayKey).filter((a) => !later.has(`${a.type}:${a.item.itemId}`)),
    [plan.items, todayKey, later],
  );
  // An item that starts while it is already on the list (same name, shown) needs no card:
  // link it quietly so a plan full of things Nate already takes doesn't open with a stack of alerts.
  const quiet = useMemo(() => alerts.filter((a) => {
    if (a.type !== 'start' || a.item.linked) return false;
    const isF = a.item.kind === 'food' || a.item.kind === 'intervention';
    const ex = findByName(isF ? inputItems : stackItems, a.item.name);
    return ex && ex.active !== false;
  }), [alerts, stackItems, inputItems]);
  useEffect(() => {
    quiet.forEach(({ item }) => {
      const isF = item.kind === 'food' || item.kind === 'intervention';
      const ex = findByName(isF ? inputItems : stackItems, item.name);
      plan.link(item.itemId, { kind: isF ? 'factor' : 'supplement', id: ex.id });
      plan.ack(item.itemId, 'start');
    });
  }, [quiet]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = alerts.filter((a) => !quiet.includes(a));
  const [details, setDetails] = useState(false);
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
  const isFactor = item.kind === 'food' || item.kind === 'intervention';
  const existing = type === 'start' && !item.linked
    ? findByName(isFactor ? inputItems : stackItems, item.name) : null;
  const next = () => setDetails(false);
  const done = () => { plan.ack(item.itemId, type); next(); };
  const snooze = () => { setLater((s) => new Set(s).add(`${type}:${item.itemId}`)); next(); };

  let primary; let secondary = null;
  if (type === 'start') {
    if (item.kind === 'test') primary = <button className="pa-btn primary" onClick={done}>Got it</button>;
    else if (existing) primary = <button className="pa-btn primary" onClick={() => { onAddToList(item, existing); done(); }}>Show it on my list</button>;
    else primary = <button className="pa-btn primary" onClick={() => { onAddToList(item); done(); }}>Add to my {isFactor ? 'factors' : 'supplements'}</button>;
    if (item.kind !== 'test') secondary = <button onClick={done}>{isFactor ? 'Don’t track' : 'Not starting'}</button>;
  } else {
    primary = item.linked
      ? <button className="pa-btn primary" onClick={() => { onHideLinked(item); done(); }}>Stopped: hide it</button>
      : <button className="pa-btn primary" onClick={done}>Got it</button>;
    if (item.linked) secondary = <button onClick={done}>Keeping it</button>;
  }
  const label = type === 'end' ? 'Time to stop' : item.startDate && item.startDate < todayKey ? 'In your plan now' : 'Starts today';
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
        <div className="pa-actions">
          {primary}
          <div className="pa-minor">
            <button onClick={snooze}>Later</button>
            {secondary}
          </div>
        </div>
      </div>
    </div>
  );
}
