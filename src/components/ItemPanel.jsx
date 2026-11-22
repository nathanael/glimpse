import { useEffect, useState } from 'react';
import './protocolPlan.css';
import { INPUT_CATEGORIES } from '../utils/constants';
import { reconstructStateAtEntry } from '../utils/helpers';
import { applySupplementPatch, applyInputPatch, formatSupplementChange, formatInputChange } from '../utils/protocolHistory';
import { kindOf, SOURCE_LABELS, phaseOf, daysBetween } from '../protocolPlan/plan';
import SchedulePicker, { formatSchedule } from './SchedulePicker';
import { DraftInput, ChangeLog } from './listParts';

// The one editor for anything on the protocol. It opens beside the Today checklist and beside the
// Timeline, and edits both halves of an item in place: the list definition (name, dose, schedule:
// what the daily checklist uses) and its plan entry (dates, why, what to watch for).
//   def  – the supplement or factor on the list, or null (a test, or something that hasn't started)
//   plan – its plan item, or null (a factor nobody planned)

const UNITS = ['mg', 'mcg', 'g', 'IU', 'ml', 'drops', 'caps'];
const VERDICTS = [
  { value: null, label: 'None' },
  { value: 'testing', label: 'Testing' },
  { value: 'bad', label: 'Bad' },
  { value: 'good', label: 'Good' },
];
const fmt = (key, opts = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  (key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', opts) : '');

// A textarea that saves when focus leaves it
function DraftArea({ value, placeholder, onCommit }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return (
    <textarea
      rows={2} value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v.trim() !== (value || '')) onCommit(v.trim()); }}
    />
  );
}

export default function ItemPanel({
  def, kind, plan, todayKey, dateKey,
  setStackItems, setInputItems, setStackEntries,
  onEditPlan,       // (planItem, fields): name, dose, dates, why…
  onEnd,            // ({def, kind, plan}, {endReason, outcome}): stop it today
  onRemove,         // ({def, kind, plan}): take it off the protocol (undoable)
  onRestore,        // ({def, kind, plan}): bring a hidden or ended item back
  onDelete,         // (def, kind): delete a hidden item for good
  onClose,
  setLastAction,
}) {
  const [ending, setEnding] = useState(false);
  const [endReason, setEndReason] = useState('');
  const [outcome, setOutcome] = useState('');
  const [more, setMore] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(null);
  const id = def?.id || plan?.itemId;
  useEffect(() => { setEnding(false); setMore(false); setScheduleOpen(false); setScheduleDraft(null); setEndReason(''); setOutcome(''); }, [id]);

  const isSupp = kind === 'supplement';
  const phase = plan ? phaseOf(plan, todayKey) : def.active === false ? 'ended' : 'active';
  // Off the list because it was stopped. Something that hasn't started yet is not "hidden".
  const hidden = def ? def.active === false && phase !== 'upcoming' : false;
  const k = plan ? kindOf(plan.kind) : isSupp ? kindOf('supplement') : kindOf('food');
  const kindLabel = !plan && !isSupp ? (INPUT_CATEGORIES.find((c) => c.id === def.category) || INPUT_CATEGORIES[0]).label : k.label;
  const src = plan?.source || {};
  const fromPractitioner = plan && !plan.fromList && plan.author && plan.author !== 'nate';
  const target = { def, kind, plan };

  const patchDef = (p) => (isSupp ? setStackItems : setInputItems)((prev) =>
    prev.map((i) => (i.id === def.id ? (isSupp ? applySupplementPatch : applyInputPatch)(i, p) : i)));
  const rename = (raw) => {
    const name = raw.trim();
    if (!name) return;
    if (def) patchDef({ name });
    if (plan && !plan.fromList) onEditPlan(plan, { name });
  };
  const commitDose = (raw) => {
    const dose = parseFloat(raw);
    if (!Number.isFinite(dose) || dose === def.defaultDose) return;
    patchDef({ defaultDose: dose });
    // Keep the viewed day's entry in step unless its dose was customised
    const key = `${dateKey}-${def.id}`;
    setStackEntries((prev) => (prev[key] && prev[key].dose === def.defaultDose ? { ...prev, [key]: { ...prev[key], dose } } : prev));
    if (plan && !plan.fromList) onEditPlan(plan, { dose });
  };
  const revert = (index) => {
    const state = reconstructStateAtEntry(def.history || [], index);
    if (!state) return;
    patchDef({
      name: state.name || def.name, defaultDose: state.defaultDose ?? def.defaultDose, unit: state.unit || def.unit,
      description: state.description || '', schedule: state.schedule || def.schedule,
    });
    setLastAction?.(`Reverted ${def.name}`);
  };
  const setDate = (field) => (e) => {
    const v = e.target.value || null;
    if (field === 'startDate' && !v) return;
    if (field === 'endDate' && v && plan.startDate && v < plan.startDate) return;
    if (field === 'startDate' && plan.endDate && v > plan.endDate) return;
    onEditPlan(plan, { [field]: v });
  };
  const segmented = (options, current, onPick) => (
    <div className="lr-seg">
      {options.map((o) => <button key={String(o.value)} className={current === o.value ? 'on' : ''} onClick={() => onPick(o.value)}>{o.label}</button>)}
    </div>
  );
  const span = plan?.startDate && (plan.endedOn || plan.endDate)
    ? (() => { const d = daysBetween(plan.startDate, plan.endedOn || plan.endDate) + 1; return d % 7 === 0 ? `${d / 7} week${d === 7 ? '' : 's'}` : `${d} days`; })()
    : null;

  return (
    <div className="pp-detail ip">
      <div className="pp-detail-head">
        <span className="pp-kind" style={{ '--c': k.color }}>{kindLabel}</span>
        <span className={`pp-phase ${hidden && phase !== 'upcoming' ? 'ended' : phase}`}>{phase === 'upcoming' ? 'Upcoming' : hidden ? 'Not on your list' : phase === 'active' ? 'Active' : 'Ended'}</span>
        <button className="pp-x" aria-label="Close" onClick={onClose}>×</button>
      </div>

      <DraftInput className="ip-name" value={def?.name ?? plan.name} placeholder="Name" onCommit={rename} />
      {def && <DraftInput className="ip-note" value={def.description} placeholder="Add a note" onCommit={(v) => patchDef({ description: v.trim() })} />}

      {def && isSupp && (
        <div className="ip-grid">
          <label>Dose
            <span className="ip-dose">
              <DraftInput inputMode="decimal" value={def.defaultDose} onCommit={commitDose} />
              <select value={def.unit} onChange={(e) => patchDef({ unit: e.target.value })}>
                {(UNITS.includes(def.unit) ? UNITS : [def.unit, ...UNITS]).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </span>
          </label>
          <label>Schedule
            <button type="button" className="ip-chip" onClick={() => { setScheduleOpen((o) => !o); setScheduleDraft(null); }}>{formatSchedule(def.schedule) || 'Daily'}</button>
          </label>
        </div>
      )}
      {def && isSupp && scheduleOpen && (
        <div className="ip-sched">
          <SchedulePicker schedule={scheduleDraft ?? def.schedule} onChange={setScheduleDraft} />
          {scheduleDraft && (
            <div className="pp-actions">
              <button className="dn-btn primary" onClick={() => { patchDef({ schedule: scheduleDraft }); setScheduleDraft(null); setScheduleOpen(false); }}>Save schedule</button>
              <button className="dn-btn ghost" onClick={() => setScheduleDraft(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}
      {!def && plan && plan.kind !== 'test' && (
        <div className="ip-grid">
          <label>Dose<DraftInput value={plan.dose ?? ''} onCommit={(v) => { const t = v.trim(); const n = Number(t); onEditPlan(plan, { dose: t === '' ? null : Number.isFinite(n) ? n : t }); }} /></label>
          <label>Unit<DraftInput value={plan.unit ?? ''} onCommit={(v) => onEditPlan(plan, { unit: v.trim() || null })} /></label>
        </div>
      )}
      {plan && !plan.fromList && (!def || (fromPractitioner && plan.frequency)) && (
        <label className="ip-field">{def ? 'How the plan says to take it' : 'How often'}
          <DraftInput value={plan.frequency ?? ''} placeholder="twice daily with food" onCommit={(v) => onEditPlan(plan, { frequency: v.trim() || null })} />
        </label>
      )}

      {plan && (
        <div className="ip-grid">
          <label>Start<input type="date" value={plan.startDate || ''} onChange={setDate('startDate')} disabled={phase === 'ended'} /></label>
          <label>{plan.status === 'ended' ? 'Ended' : 'End (optional)'}<input type="date" value={(plan.status === 'ended' && plan.endedOn) || plan.endDate || ''} onChange={setDate('endDate')} disabled={plan.status === 'ended'} /></label>
        </div>
      )}
      {span && <p className="pp-muted ip-span">{span}</p>}
      {plan?.since && phase !== 'upcoming' && <p className="pp-muted">Taking it since {fmt(plan.since)}; the plan continues it from here.</p>}
      {plan?.planned && (plan.planned.startDate !== undefined || plan.planned.endDate !== undefined) && (
        <p className="pp-muted">You changed the dates. The plan said {plan.planned.startDate !== undefined ? `start ${fmt(plan.planned.startDate) || 'unset'}` : ''}{plan.planned.startDate !== undefined && plan.planned.endDate !== undefined ? ', ' : ''}{plan.planned.endDate !== undefined ? `end ${fmt(plan.planned.endDate) || 'open'}` : ''}.</p>
      )}
      {plan?.condition && <p className="pp-cond">{plan.condition}</p>}

      {plan && !plan.fromList && (
        <>
          <label className="ip-field">Why<DraftArea value={plan.reason} placeholder="What it is for" onCommit={(v) => onEditPlan(plan, { reason: v || null })} /></label>
          <label className="ip-field">Watch for<DraftArea value={plan.watchFor} placeholder="Side effects, what to note" onCommit={(v) => onEditPlan(plan, { watchFor: v || null })} /></label>
        </>
      )}
      {plan && (plan.endReason || plan.outcome) && (
        <>
          <h4>How it ended</h4>
          {plan.endReason && <p>{plan.endReason}</p>}
          {plan.outcome && <p className="pp-muted">Outcome: {plan.outcome}</p>}
        </>
      )}

      {def && !isSupp && (
        <div className="ip-factor">
          <div className="lr-field"><label>Category</label>{segmented(INPUT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), def.category, (v) => patchDef({ category: v }))}</div>
          <div className="lr-field"><label>Verdict</label>{segmented(VERDICTS, def.verdict || null, (v) => patchDef({ verdict: v }))}</div>
          <div className="lr-field"><label>Amount unit</label>
            <input className="lr-input boxed" placeholder="drinks, squares (optional)" defaultValue={def.unit || ''} maxLength={24} key={def.id}
              onBlur={(e) => { const u = e.target.value.trim(); if (u !== (def.unit || '')) patchDef({ unit: u || null }); }} />
          </div>
          <div className="lr-field"><label>Daily check-in</label>
            {segmented([{ value: true, label: 'Ask' }, { value: false, label: 'Don’t ask' }], def.askDaily !== false, (v) => patchDef({ askDaily: v }))}
          </div>
        </div>
      )}

      {plan && !plan.fromList && (
        <p className="pp-src">
          {SOURCE_LABELS[src.type] || 'Source'}{src.date ? ` · ${fmt(src.date)}` : ''}
          {src.link && <> · <a href={src.link} target="_blank" rel="noreferrer">open</a></>}
          {fromPractitioner && <span className="pp-muted"> · added by Claude. Your changes are kept if the plan is revised.</span>}
        </p>
      )}

      {def && (
        <>
          <button type="button" className="ip-more" onClick={() => setMore((m) => !m)}>{more ? '▾' : '▸'} History{isSupp ? ' and chart settings' : ''}</button>
          {more && (
            <div className="ip-morebody">
              {isSupp && (
                <div className="lr-field">
                  <label>Decay rate</label>
                  <select className="lr-input boxed" value={def.halfLifeCategory || ''} onChange={(e) => patchDef({ halfLifeCategory: e.target.value || null })}>
                    <option value="">Auto (moderate)</option>
                    <option value="fast">Fast (~12 hours)</option>
                    <option value="moderate">Moderate (~3 days)</option>
                    <option value="slow">Slow (~21 days)</option>
                  </select>
                </div>
              )}
              <ChangeLog history={def.history} format={isSupp ? (e) => formatSupplementChange(e, def.unit) : formatInputChange} onRevert={isSupp ? revert : null} />
            </div>
          )}
        </>
      )}

      {ending ? (
        <div className="pp-form ip-end">
          <label>Why stop<input autoFocus value={endReason} onChange={(e) => setEndReason(e.target.value)} placeholder="Trial finished, side effects…" /></label>
          <label>What you noticed<input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Less bloating, no change…" /></label>
          <div className="pp-actions">
            <button className="dn-btn primary" onClick={() => { onEnd(target, { endReason: endReason.trim(), outcome: outcome.trim() }); setEnding(false); }}>End today</button>
            <button className="dn-btn ghost" onClick={() => setEnding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="pp-actions">
          {hidden || (plan && phase === 'ended') ? (
            <>
              {def && hidden && <button className="dn-btn" onClick={() => onRestore(target)}>Restore to my list</button>}
              {def && hidden && onDelete && <button className="dn-btn ghost pp-danger" onClick={() => onDelete(def, kind)}>Delete</button>}
            </>
          ) : (
            phase !== 'upcoming' && <button className="dn-btn" onClick={() => (plan ? setEnding(true) : onEnd(target, {}))}>{plan ? 'End…' : 'Hide'}</button>
          )}
          {plan && <button className="dn-btn ghost pp-danger" onClick={() => onRemove(target)}>Remove</button>}
        </div>
      )}
      {!ending && !hidden && phase === 'active' && (
        <p className="pp-muted ip-hint">{plan ? 'End stops it today and keeps its history. Remove is for something added by mistake.' : 'Hide takes it off the list and keeps its history.'}</p>
      )}
    </div>
  );
}
