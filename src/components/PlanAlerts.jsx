import { useMemo, useState } from 'react';
import './protocolPlan.css';
import { kindOf, SOURCE_LABELS, doseText, pendingAlerts, findByName } from '../protocolPlan/plan';

// Opens over the app when the protocol plan has news: something new from Nicole, something that
// starts today, or something whose trial is over. One card at a time; each needs a choice, so a
// change can't slide past unread. "Later" hides it until the app is next opened.

const TITLES = {
  added: 'New in your plan',
  updated: 'Plan updated',
  start: 'Starts today',
  end: 'Time to stop',
};
const fmt = (key) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');

export default function PlanAlerts({ plan, todayKey, stackItems, inputItems, onAddToList, onHideLinked, onOpenPlan }) {
  const [later, setLater] = useState(() => new Set());
  const alerts = useMemo(
    () => pendingAlerts(plan.items, todayKey).filter((a) => !later.has(`${a.type}:${a.item.itemId}`)),
    [plan.items, todayKey, later],
  );
  const alert = alerts[0];
  if (!alert) return null;
  const { type, item } = alert;
  const k = kindOf(item.kind);
  const src = item.source || {};
  const isFactor = item.kind === 'food' || item.kind === 'intervention';
  const existing = type === 'start' && !item.linked
    ? findByName(isFactor ? inputItems : stackItems, item.name) : null;
  const done = (ackType = type === 'updated' ? 'added' : type) => plan.ack(item.itemId, ackType);
  const snooze = () => setLater((s) => new Set(s).add(`${type}:${item.itemId}`));

  let actions;
  if (type === 'start') {
    actions = (
      <>
        {item.kind === 'test' ? (
          <button className="pa-btn primary" onClick={() => done()}>Got it</button>
        ) : existing ? (
          <button className="pa-btn primary" onClick={() => { plan.link(item.itemId, { kind: isFactor ? 'factor' : 'supplement', id: existing.id }); onAddToList(item, existing); done(); }}>
            It’s on my list already{existing.active === false ? ' (show it)' : ''}
          </button>
        ) : (
          <button className="pa-btn primary" onClick={() => { onAddToList(item); done(); }}>
            Add to my {isFactor ? 'Other factors' : 'supplements'}
          </button>
        )}
        <button className="pa-btn" onClick={snooze}>Later</button>
        {item.kind !== 'test' && <button className="pa-btn ghost" onClick={() => done()}>I’m not starting it</button>}
      </>
    );
  } else if (type === 'end') {
    actions = (
      <>
        {item.linked
          ? <button className="pa-btn primary" onClick={() => { onHideLinked(item); done(); }}>Stopped: hide it from my list</button>
          : <button className="pa-btn primary" onClick={() => done()}>Got it</button>}
        <button className="pa-btn" onClick={snooze}>Later</button>
        {item.linked && <button className="pa-btn ghost" onClick={() => done()}>I’m keeping it</button>}
      </>
    );
  } else {
    actions = (
      <>
        <button className="pa-btn primary" onClick={() => done()}>Got it</button>
        {onOpenPlan && <button className="pa-btn" onClick={() => { done(); onOpenPlan(item.itemId); }}>See the plan</button>}
      </>
    );
  }

  return (
    <div className="pa" role="dialog" aria-modal="true" aria-label={TITLES[type]}>
      <div className="pa-card">
        <div className="pa-top">
          <span className={`pa-type ${type}`}>{TITLES[type]}</span>
          {alerts.length > 1 && <span className="pa-count">1 of {alerts.length}</span>}
        </div>
        <span className="pp-kind" style={{ '--c': k.color }}>{k.label}</span>
        <h2>{item.name}</h2>
        {doseText(item) && <p className="pa-dose">{doseText(item)}</p>}
        <p className="pa-when">
          {type === 'end'
            ? `Ended ${fmt(item.endedOn || item.endDate)}`
            : item.startDate ? `${item.startDate === todayKey ? 'Today' : `${type === 'start' ? 'Started' : 'Starts'} ${fmt(item.startDate)}`}${item.endDate ? ` · until ${fmt(item.endDate)}` : ''}` : ''}
        </p>
        {item.condition && <p className="pp-cond">{item.condition}</p>}
        {type === 'end' && item.endReason && <><h4>Why stop</h4><p>{item.endReason}</p></>}
        {type !== 'end' && item.reason && <><h4>Why</h4><p>{item.reason}</p></>}
        {item.watchFor && <><h4>{type === 'end' ? 'What to note' : 'Watch for'}</h4><p>{item.watchFor}</p></>}
        {type === 'end' && item.outcome && <p className="pp-muted">Outcome so far: {item.outcome}</p>}
        <p className="pp-src">
          {SOURCE_LABELS[src.type] || 'Plan'}{src.date ? ` · ${fmt(src.date)}` : ''}
          {src.link && <> · <a href={src.link} target="_blank" rel="noreferrer">open</a></>}
        </p>
        <div className="pa-actions">{actions}</div>
      </div>
    </div>
  );
}
