import { useMemo, useRef, useState } from 'react';
import './protocolPlan.css';
import { CloseButton } from './overlay';
import {
  KINDS, kindOf, SOURCE_LABELS, phaseOf, timelineRange, barFor, addDaysKey, daysBetween, doseText, groupItems,
  listRows, dragDates,
} from '../protocolPlan/plan';

// Protocol plan: what Nicole has recommended (written by the Glimpse Health MCP) and what Nate plans
// himself, on a timeline. Desktop shows the calendar with a detail panel; the phone shows the list.

const fmt = (key, opts = { month: 'short', day: 'numeric' }) =>
  key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', opts) : '';
const spanText = (item) => {
  if (!item.startDate) return 'Start date not set';
  const start = `${fmt(item.startDate, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  const end = item.endedOn || item.endDate;
  if (!end) return item.kind === 'test' ? start : `From ${start}`;
  const days = daysBetween(item.startDate, end) + 1;
  const len = days % 7 === 0 ? `${days / 7} week${days === 7 ? '' : 's'}` : `${days} days`;
  return `${start} → ${fmt(end)} · ${len}`;
};

export function PlanDetail({ item, todayKey, onEnd, onEdit, onAddToList, onClose }) {
  const [ending, setEnding] = useState(false);
  const [endReason, setEndReason] = useState('');
  const [outcome, setOutcome] = useState('');
  const phase = phaseOf(item, todayKey);
  const k = kindOf(item.kind);
  const src = item.source || {};
  return (
    <div className="pp-detail">
      <div className="pp-detail-head">
        <span className="pp-kind" style={{ '--c': k.color }}>{k.label}</span>
        <span className={`pp-phase ${phase}`}>{phase === 'active' ? 'Active' : phase === 'upcoming' ? 'Upcoming' : 'Ended'}</span>
        {onClose && <button className="pp-x" aria-label="Close details" onClick={onClose}>×</button>}
      </div>
      <h3>{item.name}</h3>
      {doseText(item) && <p className="pp-dose">{doseText(item)}</p>}
      <p className="pp-when">{spanText(item)}</p>
      {item.planned && (item.planned.startDate !== undefined || item.planned.endDate !== undefined) && (
        <p className="pp-muted">You changed the dates. The plan said {item.planned.startDate !== undefined ? `start ${fmt(item.planned.startDate) || 'unset'}` : ''}{item.planned.startDate !== undefined && item.planned.endDate !== undefined ? ', ' : ''}{item.planned.endDate !== undefined ? `end ${fmt(item.planned.endDate) || 'open'}` : ''}.</p>
      )}
      {item.condition && <p className="pp-cond">{item.condition}</p>}
      {item.reason && <><h4>Why</h4><p>{item.reason}</p></>}
      {item.watchFor && <><h4>Watch for</h4><p>{item.watchFor}</p></>}
      {(item.endReason || item.outcome) && (
        <>
          <h4>How it ended</h4>
          {item.endReason && <p>{item.endReason}</p>}
          {item.outcome && <p className="pp-muted">Outcome: {item.outcome}</p>}
        </>
      )}
      <p className="pp-src">
        {SOURCE_LABELS[src.type] || 'Source'}{src.date ? ` · ${fmt(src.date, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        {src.link && <> · <a href={src.link} target="_blank" rel="noreferrer">open</a></>}
        {item.author && item.author !== 'nate' && <span className="pp-muted"> · added by Claude</span>}
        {item.fromList && <span className="pp-muted"> · from your supplement list</span>}
      </p>
      {item.linked && <p className="pp-muted">On your {item.linked.kind === 'factor' ? 'Other factors' : 'supplement'} list</p>}
      {ending ? (
        <div className="pp-form">
          <label>Why stop<input value={endReason} onChange={(e) => setEndReason(e.target.value)} placeholder="Trial finished, side effects…" /></label>
          <label>What you noticed<input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Less bloating, no change…" /></label>
          <div className="pp-actions">
            <button className="dn-btn primary" onClick={() => { onEnd(item, { endedOn: todayKey, endReason: endReason.trim(), outcome: outcome.trim() }); setEnding(false); }}>End today</button>
            <button className="dn-btn ghost" onClick={() => setEnding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="pp-actions">
          {phase === 'active' && !item.linked && item.kind !== 'test' && onAddToList && <button className="dn-btn primary" onClick={() => onAddToList(item)}>Add to my list</button>}
          {phase !== 'ended' && <button className="dn-btn" onClick={() => setEnding(true)}>End</button>}
          {onEdit && <button className="dn-btn ghost" onClick={() => onEdit(item)}>Edit</button>}
        </div>
      )}
    </div>
  );
}

function PlanForm({ initial, todayKey, onSave, onCancel }) {
  const [f, setF] = useState(() => ({
    name: '', kind: 'supplement', dose: '', unit: 'mg', frequency: '', startDate: addDaysKey(todayKey, 1), endDate: '',
    reason: '', watchFor: '', condition: '', ...initial,
  }));
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const valid = f.name.trim() && f.startDate && (!f.endDate || f.endDate >= f.startDate);
  const save = () => {
    if (!valid) return;
    const doseIn = String(f.dose ?? '').trim();
    const num = Number(doseIn);
    const dose = initial && doseIn === String(initial.dose ?? '') ? (initial.dose ?? null)
      : doseIn === '' ? null : Number.isFinite(num) ? num : doseIn;
    onSave({
      ...(initial?.itemId ? { itemId: initial.itemId } : {}),
      name: f.name.trim(), kind: f.kind, dose, unit: f.unit.trim() || null,
      frequency: f.frequency.trim() || null, startDate: f.startDate, endDate: f.endDate || null,
      reason: f.reason.trim() || null, watchFor: f.watchFor.trim() || null, condition: f.condition.trim() || null,
    });
  };
  return (
    <div className="pp-detail pp-form">
      <div className="pp-detail-head"><b>{initial?.itemId ? (initial.author && initial.author !== 'nate' ? 'Adjust plan item' : 'Edit plan item') : 'Plan an item'}</b><button className="pp-x" aria-label="Cancel" onClick={onCancel}>×</button></div>
      <label>Name<input autoFocus value={f.name} onChange={set('name')} placeholder="Zinc carnosine" /></label>
      <div className="pp-seg">{KINDS.map((k) => <button key={k.id} type="button" className={f.kind === k.id ? 'on' : ''} onClick={() => setF((p) => ({ ...p, kind: k.id }))}>{k.label}</button>)}</div>
      <div className="pp-row">
        <label>Dose<input inputMode="decimal" value={f.dose ?? ''} onChange={set('dose')} /></label>
        <label>Unit<input value={f.unit ?? ''} onChange={set('unit')} /></label>
        <label className="grow">How often<input value={f.frequency ?? ''} onChange={set('frequency')} placeholder="twice daily with food" /></label>
      </div>
      <div className="pp-row">
        <label>Start<input type="date" value={f.startDate || ''} onChange={set('startDate')} /></label>
        <label>End (optional)<input type="date" value={f.endDate || ''} onChange={set('endDate')} /></label>
      </div>
      {initial?.author && initial.author !== 'nate' && <p className="pp-muted">Your changes are kept even if Claude later revises this item.</p>}
      <label>Why<textarea rows={2} value={f.reason ?? ''} onChange={set('reason')} /></label>
      <label>Watch for<textarea rows={2} value={f.watchFor ?? ''} onChange={set('watchFor')} /></label>
      <label>Condition<input value={f.condition ?? ''} onChange={set('condition')} placeholder="only if tolerated" /></label>
      <div className="pp-actions">
        <button className="dn-btn primary" disabled={!valid} onClick={save}>Save</button>
        <button className="dn-btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Desktop timeline. Drag a bar to move it, or its edges to change the start or end (one-day steps);
// a plain click selects. Ended items stay put.
function Timeline({ items, todayKey, selectedId, onSelect, onMove }) {
  const [drag, setDrag] = useState(null); // {itemId, mode, x0, dayW, delta, fallbackEnd}
  const moved = useRef(false);
  const shown = useMemo(() => (drag
    ? items.map((i) => (i.itemId === drag.itemId ? { ...i, ...(dragDates(i, drag.mode, drag.delta, todayKey, drag.fallbackEnd) || {}) } : i))
    : items), [items, drag, todayKey]);
  const range = useMemo(() => timelineRange(items, todayKey), [items, todayKey]);
  // Rows keep their place while dragging (grouped by where they were before the drag)
  const base = useMemo(() => groupItems(items, todayKey), [items, todayKey]);
  const byId = useMemo(() => new Map(shown.map((i) => [i.itemId, i])), [shown]);
  const rows = [
    ...base.active.map((i) => ['Active now', byId.get(i.itemId)]),
    ...base.upcoming.map((i) => ['Upcoming', byId.get(i.itemId)]),
    ...base.ended.filter((i) => barFor(i, range)).map((i) => ['Ended', byId.get(i.itemId)]),
  ];
  const ticks = [];
  for (let d = 0; d < range.days; d++) {
    const key = addDaysKey(range.from, d);
    if (new Date(`${key}T12:00:00`).getDay() === 1) ticks.push({ key, left: d / range.days });
  }
  const todayLeft = (daysBetween(range.from, todayKey) + 0.5) / range.days;

  const startDrag = (e, item, mode) => {
    if (!onMove || e.button !== 0) return;
    e.stopPropagation();
    const track = e.currentTarget.closest('.pp-tl-track');
    const rect = track.getBoundingClientRect();
    const dayW = rect.width / range.days;
    const dayAt = Math.floor((e.clientX - rect.left) / dayW);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moved.current = false;
    setDrag({ itemId: item.itemId, mode, x0: e.clientX, dayW, delta: 0, fallbackEnd: addDaysKey(range.from, Math.min(dayAt, range.days - 1)) });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x0) / drag.dayW);
    if (delta !== drag.delta) { moved.current = moved.current || delta !== 0; setDrag({ ...drag, delta }); }
  };
  const endDrag = () => {
    if (!drag) return;
    const item = items.find((i) => i.itemId === drag.itemId);
    const dates = item && dragDates(item, drag.mode, drag.delta, todayKey, drag.fallbackEnd);
    setDrag(null);
    if (dates && moved.current) onMove(item, dates);
  };

  let lastGroup = null;
  return (
    <div className={`pp-tl ${drag ? 'dragging' : ''}`} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
      <div className="pp-tl-head">
        <div className="pp-tl-name" />
        <div className="pp-tl-track">
          {ticks.map((t) => <span key={t.key} className="pp-tick" style={{ left: `${t.left * 100}%` }}>{fmt(t.key)}</span>)}
        </div>
      </div>
      {rows.length === 0 && <div className="pp-empty">Nothing planned yet. Items Claude adds from your calls with Nicole show up here, or plan one yourself.</div>}
      {rows.map(([group, item]) => {
        const bar = barFor(item, range);
        const k = kindOf(item.kind);
        const head = group !== lastGroup ? (lastGroup = group) : null;
        const phase = phaseOf(item, todayKey);
        const canDrag = onMove && group !== 'Ended';
        const isDragging = drag?.itemId === item.itemId;
        return (
          <div key={item.itemId}>
            {head && <div className="pp-tl-group">{head}</div>}
            <div
              role="button" tabIndex={0}
              className={`pp-tl-row ${selectedId === item.itemId ? 'on' : ''}`}
              onClick={() => { if (moved.current) { moved.current = false; return; } onSelect(item.itemId); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item.itemId); } }}
            >
              <div className="pp-tl-name"><b>{item.name}</b><small>{doseText(item) || k.label}</small></div>
              <div className="pp-tl-track">
                {ticks.map((t) => <i key={t.key} className="pp-grid" style={{ left: `${t.left * 100}%` }} />)}
                <i className="pp-today" style={{ left: `${todayLeft * 100}%` }} />
                {bar && (
                  <span
                    className={`pp-bar ${phase} ${bar.open ? 'open' : ''} ${canDrag ? 'draggable' : ''} ${isDragging ? 'drag' : ''}`}
                    style={{ left: `${bar.left * 100}%`, width: `${bar.width * 100}%`, '--c': k.color }}
                    onPointerDown={canDrag ? (e) => startDrag(e, item, 'move') : undefined}
                    title={canDrag ? 'Drag to move · drag an edge to change start or end' : undefined}
                  >
                    {canDrag && !bar.clippedLeft && <i className="pp-h l" onPointerDown={(e) => startDrag(e, item, 'start')} />}
                    <span className="pp-bar-label">
                      {isDragging
                        ? `${fmt(item.startDate)}${item.endDate ? ` → ${fmt(item.endDate)}` : ''}`
                        : item.startDate && item.startDate >= range.from && fmt(item.startDate)}
                    </span>
                    {canDrag && <i className="pp-h r" onPointerDown={(e) => startDrag(e, item, 'end')} />}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanList({ items, todayKey, selectedId, onSelect, renderDetail }) {
  const g = useMemo(() => groupItems(items, todayKey), [items, todayKey]);
  const section = (title, list) => list.length > 0 && (
    <div className="pp-list-sec" key={title}>
      <div className="pp-tl-group">{title}</div>
      {list.map((item) => (
        <div key={item.itemId}>
          <button className={`pp-list-row ${selectedId === item.itemId ? 'on' : ''}`} onClick={() => onSelect(selectedId === item.itemId ? null : item.itemId)}>
            <i style={{ background: kindOf(item.kind).color }} />
            <span><b>{item.name}</b><small>{spanText(item)}</small></span>
          </button>
          {selectedId === item.itemId && renderDetail(item)}
        </div>
      ))}
    </div>
  );
  return (
    <div className="pp-list">
      {items.length === 0 && <div className="pp-empty">Nothing planned yet. Items Claude adds from your calls with Nicole show up here, or plan one yourself.</div>}
      {section('Active now', g.active)}
      {section('Upcoming', g.upcoming)}
      {section('Ended', g.ended.slice(0, 20))}
    </div>
  );
}

export default function ProtocolPlan({ plan, todayKey, isDesktop, stackItems, onAddToList, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null); // null | {} (new) | item (edit)
  // The plan plus every supplement on the list that no plan item covers, so the planner holds the whole regimen
  const items = useMemo(() => {
    const planItems = (plan.items || []).filter((i) => !i.deleted);
    return [...planItems, ...listRows(stackItems, planItems, todayKey)];
  }, [plan.items, stackItems, todayKey]);
  const selected = items.find((i) => i.itemId === selectedId);

  const detail = (item, closable) => (
    <PlanDetail
      item={item}
      todayKey={todayKey}
      onEnd={(i, data) => (i.fromList ? plan.editItem(i, { status: 'ended', ...data }) : plan.endItem(i.itemId, data))}
      onEdit={(i) => setForm(i)}
      onAddToList={onAddToList}
      onClose={closable ? () => setSelectedId(null) : null}
    />
  );
  const formEl = form && (
    <PlanForm
      initial={form.itemId ? form : null}
      todayKey={todayKey}
      onCancel={() => setForm(null)}
      onSave={(data) => {
        if (form.itemId) { plan.editItem(form, data); setForm(null); setSelectedId(form.itemId); return; }
        const id = plan.saveOwnItem(data); setForm(null); setSelectedId(id);
      }}
    />
  );

  const head = (
    <div className="pp-head">
      <h2>Protocol plan</h2>
      {plan.error && <span className="pp-err">{plan.error}</span>}
      <button className="dn-btn primary" onClick={() => { setForm({}); setSelectedId(null); }}>+ Plan an item</button>
      {onClose && <CloseButton label="Close plan" onClick={onClose} />}
    </div>
  );

  if (isDesktop) {
    return (
      <div className="pp desktop">
        {head}
        <div className="pp-body">
          <Timeline items={items} todayKey={todayKey} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setForm(null); }} onMove={(i, dates) => plan.editItem(i, dates)} />
          {(formEl || selected) && <aside className="pp-side">{formEl || detail(selected, true)}</aside>}
        </div>
      </div>
    );
  }
  return (
    <div className="pp mobile">
      {head}
      <div className="pp-scroll">
        {formEl}
        <PlanList items={items} todayKey={todayKey} selectedId={selectedId} onSelect={setSelectedId} renderDetail={(i) => detail(i, false)} />
      </div>
    </div>
  );
}
