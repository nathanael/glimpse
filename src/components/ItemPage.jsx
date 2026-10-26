// One supplement or symptom on its own full-screen page: the last two weeks at a glance, each
// setting as a row that opens a sheet to change it, the change log, then Hide and Delete.
// Opened by swiping a row left and tapping Edit. Every change saves as it is made, through the
// same patch helpers the edit lists use, so history entries are recorded the same way.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDateKey, isScheduledForDate } from '../utils/helpers';
import { getStripDateKeys, getSeverityStrip } from '../utils/listHelpers';
import { applySupplementPatch, formatSupplementChange } from '../utils/protocolHistory';
import { applySymptomPatch, formatSymptomChange } from '../utils/symptomHistory';
import { matchSupplementCategory } from '../utils/supplementLookup';
import { availableGroups, nextGroupOrder } from '../utils/symptomGroups';
import { isWellbeing, colorIndex } from '../utils/wellbeing';
import { timeLabel } from '../utils/timeOfDay';
import { STRIP_COLOR } from './severityStyle';
import { CloseButton, useRiseIn } from './overlay';
import { DosePicker, WhenPicker, DECAY, scheduleText, useFlowViewport, useFocusOnMount } from './AddFlow';
import './flow.css';

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// A sheet's text field, focused as the sheet opens without the page jumping to it
function SheetInput(props) {
  const ref = useRef(null);
  useFocusOnMount(ref);
  return <input ref={ref} enterKeyHint="done" {...props} />;
}

function Sheet({ title, onClose, onSave, children }) {
  return (
    <>
      <div className="fl-sheet-dim" onClick={onClose} />
      <div className="fl-sheet" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <button type="button" className="fl-next" onClick={onSave}>Save</button>
      </div>
    </>
  );
}

export default function ItemPage({ kind, id, stackItems, setStackItems, stackEntries, symptoms, setSymptoms, entries, onDelete, setLastAction, onClose }) {
  const rootRef = useRef(null);
  useRiseIn(rootRef);
  useFlowViewport(rootRef);
  const isSupp = kind === 'supplement';
  const item = (isSupp ? stackItems : symptoms).find((i) => i.id === id);
  const [sheet, setSheet] = useState(null);   // which setting is being changed
  const [draft, setDraft] = useState({});

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') (sheet ? setSheet(null) : onClose()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sheet]);

  const today = useMemo(() => new Date(), []);
  const keys = useMemo(() => getStripDateKeys(today, 14), [today]);
  useEffect(() => { if (!item || item.deletedAt) onClose(); }, [item, onClose]);
  if (!item) return null;

  const patch = (p) => (isSupp
    ? setStackItems((prev) => prev.map((i) => (i.id === id ? applySupplementPatch(i, p) : i)))
    : setSymptoms((prev) => prev.map((s) => (s.id === id ? applySymptomPatch(s, p) : s))));

  const open = (which) => {
    setDraft({
      name: item.name,
      note: item.description || '',
      dose: item.defaultDose ? String(item.defaultDose) : '',
      unit: item.unit || 'mg',
      schedule: item.schedule || { type: 'daily' },
      time: item.timeOfDay || null,
      group: item.group || null,
    });
    setSheet(which);
  };
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    if (sheet === 'name' && draft.name.trim()) patch({ name: draft.name.trim() });
    if (sheet === 'note') patch({ description: draft.note.trim() });
    if (sheet === 'dose') patch({ defaultDose: parseFloat(draft.dose) || 0, unit: draft.unit });
    if (sheet === 'when') {
      const startDate = item.schedule?.startDate || getDateKey(new Date());
      const s = draft.schedule.type === 'days' ? { type: 'days', days: draft.schedule.days, startDate }
        : draft.schedule.type === 'interval' ? { type: 'interval', interval: draft.schedule.interval, startDate }
        : { type: 'daily', startDate };
      patch({ schedule: s, timeOfDay: draft.time || null });
    }
    if (sheet === 'group') {
      const g = draft.group;
      if (!g) patch({ group: null });
      else {
        const member = symptoms.find((s) => s.group === g && typeof s.groupOrder === 'number');
        patch({ group: g, groupOrder: member ? member.groupOrder : nextGroupOrder(symptoms) });
      }
    }
    setSheet(null);
  };

  const hidden = !item.active;
  const toggleHidden = () => {
    patch({ active: hidden });
    setLastAction(hidden ? `Restored ${item.name}` : `${item.name} hidden (history kept)`);
    if (!hidden) onClose();
  };

  // Last 14 days: taken / rated, or not due
  const strip = isSupp
    ? keys.map((k) => ({ k, cls: stackEntries[`${k}-${id}`] ? 'y' : isScheduledForDate(item.schedule, new Date(`${k}T12:00:00`)) ? '' : 'skip' }))
    : getSeverityStrip(entries, id, keys).map((v, i) => ({ k: keys[i], v }));

  const history = (item.history || []).map((h) => ({ at: h.timestamp, text: isSupp ? formatSupplementChange(h, item.unit) : formatSymptomChange(h) }))
    .filter((h) => h.text).reverse().slice(0, 6);
  const autoDecay = matchSupplementCategory(item.name) || 'moderate';
  const groups = availableGroups(symptoms);

  return (
    <div className={`fl ${isSupp ? '' : 'sym'}`} ref={rootRef} role="dialog" aria-label={item.name}>
      <div className="fl-in">
        <div className="fl-top"><span style={{ marginRight: 'auto', fontSize: 14, color: '#9ca3af' }}>Saves as you go</span><CloseButton onClick={onClose} /></div>
        <div className="fl-body">
          <h1 style={{ margin: '22px 0 4px' }}>{item.name}</h1>
          <p className="fl-sub" style={{ margin: 0 }}>
            {isSupp ? `${item.defaultDose ? `${item.defaultDose} ${item.unit} · ` : ''}${scheduleText(item.schedule)}` : isWellbeing(item) ? 'Wellbeing, higher is better' : 'Symptom'}
            {hidden ? ' · hidden' : ''}
          </p>
          <div className="fl-strip">
            {strip.map((d) => (isSupp
              ? <i key={d.k} className={d.cls} />
              : <i key={d.k} style={d.v === null || d.v === undefined ? undefined : { background: STRIP_COLOR[colorIndex(item, Math.round(d.v))] }} />))}
          </div>
          <div className="fl-strip-l"><span>2 weeks ago</span><span>Today</span></div>

          <div style={{ marginTop: 14 }}>
            <button type="button" className="fl-field" onClick={() => open('name')}><span>Name</span><b>{item.name}</b><i /></button>
            {isSupp && <button type="button" className="fl-field" onClick={() => open('dose')}><span>Dose</span><b>{item.defaultDose ? `${item.defaultDose} ${item.unit}` : 'No set dose'}</b><i /></button>}
            {isSupp && <button type="button" className="fl-field" onClick={() => open('when')}><span>When</span><b>{scheduleText(item.schedule)}{item.timeOfDay ? ` · ${timeLabel(item.timeOfDay)}` : ''}</b><i /></button>}
            {!isSupp && !isWellbeing(item) && <button type="button" className="fl-field" onClick={() => open('group')}><span>Group</span><b>{item.group || 'None'}</b><i /></button>}
            <button type="button" className="fl-field" onClick={() => open('note')}><span>Description</span><b style={item.description ? undefined : { color: '#6b7280' }}>{item.description || 'Add a description'}</b><i /></button>
            {isSupp && (
              <label className="fl-field">
                <span>Decay rate</span>
                <select value={item.halfLifeCategory || ''} onChange={(e) => patch({ halfLifeCategory: e.target.value || null })}>
                  {DECAY.map((d) => <option key={d.value} value={d.value}>{d.value ? d.label : `Auto (${autoDecay})`}</option>)}
                </select>
              </label>
            )}
          </div>

          {history.length > 0 && (
            <>
              <div className="fl-lbl">CHANGES</div>
              <div className="fl-log">{history.map((h, i) => <div key={i}><span>{shortDate(h.at)}</span>{h.text}</div>)}</div>
            </>
          )}
        </div>
        <div className="fl-foot">
          <div className="fl-pair">
            <button type="button" onClick={toggleHidden}>{hidden ? 'Restore' : 'Hide'}</button>
            {onDelete && <button type="button" className="danger" onClick={() => { onDelete(item); onClose(); }}>Delete</button>}
          </div>
        </div>
      </div>

      {sheet === 'name' && (
        <Sheet title="Name" onClose={() => setSheet(null)} onSave={save}>
          <SheetInput className="fl-input big" value={draft.name} onChange={(e) => set('name')(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </Sheet>
      )}
      {sheet === 'note' && (
        <Sheet title="Description" onClose={() => setSheet(null)} onSave={save}>
          <SheetInput className="fl-input" value={draft.note} placeholder="e.g. with dinner, for sleep" onChange={(e) => set('note')(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </Sheet>
      )}
      {sheet === 'dose' && (
        <Sheet title="Dose" onClose={() => setSheet(null)} onSave={save}>
          <DosePicker dose={draft.dose} setDose={set('dose')} unit={draft.unit} setUnit={set('unit')} />
          <p className="fl-hint" style={{ textAlign: 'center' }}>Applies from now. Days already logged keep their dose.</p>
        </Sheet>
      )}
      {sheet === 'when' && (
        <Sheet title="When" onClose={() => setSheet(null)} onSave={save}>
          <WhenPicker schedule={draft.schedule} setSchedule={set('schedule')} time={draft.time} setTime={set('time')} />
        </Sheet>
      )}
      {sheet === 'group' && (
        <Sheet title="Group" onClose={() => setSheet(null)} onSave={save}>
          <div className="fl-chips">
            {groups.map((g) => <button key={g} type="button" className={draft.group === g ? 'on' : ''} onClick={() => set('group')(draft.group === g ? null : g)}>{g}</button>)}
            <button type="button" className={!draft.group ? 'on' : ''} onClick={() => set('group')(null)}>None</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
