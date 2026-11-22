import { useState, useEffect, useMemo } from 'react';
import HiddenSearchResults, { findHiddenMatches } from './HiddenSearchResults';
import { createPortal } from 'react-dom';
import './listUi.css';
import { INPUT_CATEGORIES, VERDICT_COLORS } from '../utils/constants';
import { isYes, isNo, countOf, amountLabel } from '../utils/dailyFactors';
import {
  getDateKey,
  haptic,
  isScheduledForDate,
  createHistoryEntry,
  applyHistoricalState,
  reconstructStateAtEntry,
} from '../utils/helpers';
import { getStripDateKeys, stepIndex, reorder, makeId } from '../utils/listHelpers';
import {
  applySupplementPatch,
  applyInputPatch,
  formatSupplementChange,
  formatInputChange,
  nextDueLabel,
} from '../utils/protocolHistory';
import { matchSupplementCategory } from '../utils/supplementLookup';
import SchedulePicker, { formatSchedule } from './SchedulePicker';
import { isTyping, DraftInput, useReorderDrag, ChangeLog } from './listParts';
import SwipeRow, { swipeIcons } from './SwipeRow';
import { groupByTime } from '../utils/timeOfDay';

const UNITS = ['mg', 'mcg', 'g', 'IU', 'ml', 'drops', 'caps'];
const VERDICTS = [
  { value: null, label: 'None' },
  { value: 'testing', label: 'Testing' },
  { value: 'bad', label: 'Bad' },
  { value: 'good', label: 'Good' },
];
const HIDDEN_PREVIEW = 3;

const categoryOf = (id) => INPUT_CATEGORIES.find((c) => c.id === id) || INPUT_CATEGORIES[0];
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const matches = (item, search) => {
  if (!search) return true;
  const s = search.toLowerCase();
  return item.name.toLowerCase().includes(s) || (item.description || '').toLowerCase().includes(s);
};

export default function ProtocolRows({
  stackItems,
  setStackItems,
  stackEntries,
  setStackEntries,
  inputItems,
  setInputItems,
  inputEntries,
  setInputEntries,
  selectedDate,
  setLastAction,
  search,
  setSearch,
  onOpenSupplementGraph,
  onCheckAll,
  onClearDay,
  onMatchYesterday,
  onDeleteItem,
  allStackItems,
  allInputItems,
  onRestoreDeleted,
  editing,
  setEditing,
  keyboardEnabled,
  isDesktop,
  barSlot,
  onEditItem,         // mobile: a row's swipe Edit opens the item's full-screen page
  tab: tabProp,
  onTab,
  // Desktop: one editor beside the list instead of an edit mode
  selection,          // { kind, id } | { planId } | null: what the side panel shows
  onSelect,           // (selection) => void
  planTags,           // Map 'kind:id' -> 'Nicole · until Dec 19'
  upcoming,           // plan items that haven't started: [{ itemId, name, kind, startDate }]
}) {
  const dateKey = getDateKey(selectedDate);
  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const [focusId, setFocusId] = useState(null);
  const [dosingId, setDosingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [scheduleDraft, setScheduleDraft] = useState(null);
  const [showAllHidden, setShowAllHidden] = useState(false);
  const [showMore, setShowMore] = useState(false);     // desktop: not due today + starting soon
  const [showHidden, setShowHidden] = useState(false); // desktop: hidden items
  const [adding, setAdding] = useState(null); // 'supplement' | 'factor'
  const [ownTab, setOwnTab] = useState('s'); // phone list: 's' supplements | 'f' other factors
  const tab = tabProp ?? ownTab;
  const setTab = onTab ?? setOwnTab;

  useEffect(() => setScheduleDraft(null), [expandedId]);

  // ---- View model ----
  // Supplements as they were on the selected date, split into due and not-due
  const { dueItems, otherItems } = useMemo(() => {
    const withHistory = stackItems.map((item) => applyHistoricalState(item, selectedDate));
    const activeThen = withHistory.filter((item) => item.active !== false);
    const due = activeThen.filter((item) => isScheduledForDate(item.schedule, selectedDate));
    const dueIds = new Set(due.map((i) => i.id));
    // Anything logged that day is shown as a normal row even if it was off-schedule or since hidden
    const logged = withHistory.filter((item) => !dueIds.has(item.id) && stackEntries[`${dateKey}-${item.id}`]);
    const shown = new Set([...dueIds, ...logged.map((i) => i.id)]);
    const others = activeThen.filter((item) => !shown.has(item.id));
    return {
      dueItems: [...due, ...logged].sort(byOrder).filter((i) => matches(i, search)),
      otherItems: others.sort(byOrder).filter((i) => matches(i, search)),
    };
  }, [stackItems, stackEntries, selectedDate, dateKey, search]);

  const factors = useMemo(() => {
    const active = inputItems.filter((i) => i.active);
    const activeIds = new Set(active.map((i) => i.id));
    const logged = inputItems.filter((i) => !activeIds.has(i.id) && isYes(inputEntries[`${dateKey}-${i.id}`]));
    return [...active, ...logged].sort(byOrder).filter((i) => matches(i, search));
  }, [inputItems, inputEntries, dateKey, search]);

  // Search also finds hidden and deleted items (not already shown above) so they can be restored in place
  const hiddenMatches = useMemo(() => {
    const shown = new Set([...dueItems, ...otherItems, ...factors].map((i) => i.id));
    return findHiddenMatches(search, [['supplement', allStackItems || stackItems], ['factor', allInputItems || inputItems]], shown);
  }, [search, allStackItems, allInputItems, stackItems, inputItems, dueItems, otherItems, factors]);

  const stripKeys = useMemo(() => getStripDateKeys(selectedDate, 14), [dateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rows reachable from the keyboard, in display order
  // Desktop shows two groups, and a row can be dragged from one to the other: psyllium husk is a
  // "factor" in the data (a yes/no with a count) but belongs with the supplements. `section` on the
  // item says which group it sits in; without it a supplement is in Supplements and a factor in
  // Diet and lifestyle. The data type, its history and its daily check-in question stay as they were.
  const deskSections = useMemo(() => {
    const rows = [
      ...dueItems.map((item) => ({ item, kind: 'supplement', section: item.section || 'supp' })),
      ...factors.map((item) => ({ item, kind: 'factor', section: item.section || 'life' })),
    ];
    const native = (r) => (r.kind === 'supplement' ? 'supp' : 'life');
    const inOrder = (sec) => rows.filter((r) => r.section === sec)
      .sort((a, b) => (a.item.order || 0) - (b.item.order || 0) || (a.section === native(a) ? -1 : 1));
    return { supp: inOrder('supp'), life: inOrder('life') };
  }, [dueItems, factors]);
  const navRows = useMemo(
    () => (isDesktop
      ? [...deskSections.supp, ...deskSections.life].map((r) => ({ id: r.item.id, kind: r.kind }))
      : [...dueItems.map((i) => ({ id: i.id, kind: 'supplement' })), ...factors.map((i) => ({ id: i.id, kind: 'factor' }))]),
    [isDesktop, deskSections, dueItems, factors]
  );

  useEffect(() => {
    if (isDesktop && focusId === null && navRows.length > 0) setFocusId(navRows[0].id);
  }, [isDesktop, navRows, focusId]);

  const takenCount = dueItems.filter((i) => stackEntries[`${dateKey}-${i.id}`]).length;
  // Mobile groups the day's supplements by time of day (one plain section when none has a time)
  const timeSections = useMemo(() => (isDesktop ? [{ id: 'all', label: null, items: dueItems }] : groupByTime(dueItems)), [isDesktop, dueItems]);
  const loggedCount = factors.filter((i) => isYes(inputEntries[`${dateKey}-${i.id}`])).length;
  const hasAnyToday = takenCount + loggedCount > 0;

  // ---- Logging ----
  const toggleSupplement = (item) => {
    haptic('light');
    const key = `${dateKey}-${item.id}`;
    setStackEntries((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { date: dateKey, itemId: item.id, dose: item.defaultDose || 0, taken: true } };
    });
    setLastAction(`${stackEntries[key] ? 'Removed' : 'Took'} ${item.name}`);
  };

  const setDose = (item, raw) => {
    setDosingId(null);
    const dose = parseFloat(raw);
    if (!Number.isFinite(dose)) return;
    const key = `${dateKey}-${item.id}`;
    setStackEntries((prev) => ({
      ...prev,
      [key]: prev[key] ? { ...prev[key], dose } : { date: dateKey, itemId: item.id, dose, taken: true },
    }));
    setLastAction(`${item.name}: ${dose}${item.unit}`);
  };

  const setFactorCount = (item, count) => {
    haptic('light');
    const key = `${dateKey}-${item.id}`;
    setInputEntries((prev) => {
      if (count <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...(prev[key] || { date: dateKey, inputId: item.id }), logged: true, count } };
    });
    setLastAction(count <= 0 ? `Removed ${item.name}` : count === 1 ? `Logged ${item.name}` : `${item.name} ${amountLabel(item, count)}`);
  };

  const toggleRow = (row) => {
    if (row.kind === 'supplement') {
      const item = [...dueItems, ...otherItems].find((i) => i.id === row.id);
      if (item) toggleSupplement(item);
    } else {
      const item = factors.find((i) => i.id === row.id);
      if (item) setFactorCount(item, isYes(inputEntries[`${dateKey}-${item.id}`]) ? 0 : 1);
    }
  };

  const moveFocus = (dir) => {
    const from = navRows.findIndex((r) => r.id === focusId);
    const idx = stepIndex(navRows, from, dir);
    if (idx >= 0) setFocusId(navRows[idx].id);
  };

  useEffect(() => {
    if (!isDesktop || editing || !keyboardEnabled) return;
    const onKey = (e) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const row = navRows.find((r) => r.id === focusId);
      if (e.key === 'Enter' && row && onSelect) onSelect({ kind: row.kind, id: row.id });
      else if (e.key === 'ArrowDown') moveFocus(1);
      else if (e.key === 'ArrowUp') moveFocus(-1);
      else if (row && (e.key === ' ' || e.key === 'x' || e.key === 'X')) { toggleRow(row); moveFocus(1); }
      else if (row && row.kind === 'supplement' && (e.key === 'd' || e.key === 'D')) setDosingId(row.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!editing) return;
    const onKey = (e) => { if (e.key === 'Escape' && !isTyping(e.target)) setEditing(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, setEditing]);

  // ---- Edit mode ----
  const activeSupplements = useMemo(() => stackItems.filter((i) => i.active).sort(byOrder), [stackItems]);
  const activeFactors = useMemo(() => inputItems.filter((i) => i.active).sort(byOrder), [inputItems]);
  // Hidden means stopped. Something that simply hasn't started yet is listed under "starting soon" instead.
  const hiddenRows = useMemo(
    () => {
      const waiting = new Set((upcoming || []).filter((u) => u.linked?.id).map((u) => `${u.linked.kind}:${u.linked.id}`));
      return [
        ...stackItems.filter((i) => !i.active && !waiting.has(`supplement:${i.id}`)).map((item) => ({ item, kind: 'supplement' })),
        ...inputItems.filter((i) => !i.active && !waiting.has(`factor:${i.id}`)).map((item) => ({ item, kind: 'factor' })),
      ];
    },
    [stackItems, inputItems, upcoming]
  );

  const patchSupplement = (id, patch) =>
    setStackItems((prev) => prev.map((i) => (i.id === id ? applySupplementPatch(i, patch) : i)));
  const patchFactor = (id, patch) =>
    setInputItems((prev) => prev.map((i) => (i.id === id ? applyInputPatch(i, patch) : i)));
  const patch = (kind, id, p) => (kind === 'supplement' ? patchSupplement(id, p) : patchFactor(id, p));

  const commitDefaultDose = (item, raw) => {
    const dose = parseFloat(raw);
    if (!Number.isFinite(dose) || dose === item.defaultDose) return;
    patchSupplement(item.id, { defaultDose: dose });
    // Keep today's entry in step unless its dose was customised
    const key = `${dateKey}-${item.id}`;
    setStackEntries((prev) => (prev[key] && prev[key].dose === item.defaultDose ? { ...prev, [key]: { ...prev[key], dose } } : prev));
  };

  const revertSupplement = (item, index) => {
    const state = reconstructStateAtEntry(item.history || [], index);
    if (!state) return;
    patchSupplement(item.id, {
      name: state.name || item.name,
      defaultDose: state.defaultDose ?? item.defaultDose,
      unit: state.unit || item.unit,
      description: state.description || '',
      schedule: state.schedule || item.schedule,
    });
    setLastAction(`Reverted ${item.name}`);
  };

  const addItem = (kind, raw) => {
    setAdding(null);
    const name = raw.trim();
    if (!name) return;
    const list = kind === 'supplement' ? stackItems : inputItems;
    const existing = list.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!existing.active) patch(kind, existing.id, { active: true });
      setLastAction(existing.active ? `${name} already exists` : `Restored ${existing.name}`);
      return;
    }
    const order = Math.max(-1, ...list.map((i) => i.order || 0)) + 1;
    if (kind === 'supplement') {
      const item = {
        id: makeId(name), name, unit: 'mg', defaultDose: 0, description: '',
        schedule: { type: 'daily', startDate: getDateKey(new Date()) },
        halfLifeCategory: matchSupplementCategory(name) || null, active: true, order,
      };
      item.history = [createHistoryEntry(item)];
      setStackItems((prev) => [...prev, item]);
      setExpandedId(item.id);
      onSelect?.({ kind: 'supplement', id: item.id });
    } else {
      const item = { id: makeId(name), name, description: '', category: 'food', active: true, order, verdict: null, verdictDate: null };
      item.history = [{ timestamp: new Date().toISOString(), type: 'created', snapshot: { name, description: '', category: 'food', active: true, verdict: null } }];
      setInputItems((prev) => [...prev, item]);
      setExpandedId(item.id);
      onSelect?.({ kind: 'factor', id: item.id });
    }
    setLastAction(`Added ${name}`);
  };

  const commitReorder = (fromId, toId, group, order) => {
    if (group === 'protocol') {
      // `order` is the desktop list as it now looks: 's:<id>' / 'f:<id>' rows with 'group:<section>'
      // headers between. Each row takes the section it sits under and its place on screen.
      let section = 'supp';
      const place = new Map();
      order.forEach((id, idx) => { if (id.startsWith('group:')) section = id.slice(6); else place.set(id, { section, order: idx }); });
      const apply = (prefix, home) => (prev) => prev.map((i) => {
        const at = place.get(`${prefix}:${i.id}`);
        if (!at) return i;
        const sec = at.section === home ? null : at.section;
        return i.order === at.order && (i.section || null) === sec ? i : { ...i, order: at.order, section: sec };
      });
      setStackItems(apply('s', 'supp'));
      setInputItems(apply('f', 'life'));
      haptic('medium');
      return;
    }
    const list = group === 'supplement' ? activeSupplements : activeFactors;
    const ids = reorder(list.map((i) => i.id), fromId, toId);
    const apply = (prev) => prev.map((i) => {
      const idx = ids.indexOf(i.id);
      return idx === -1 || i.order === idx ? i : { ...i, order: idx };
    });
    if (group === 'supplement') setStackItems(apply); else setInputItems(apply);
    haptic('medium');
  };
  const { gripProps, rowClass: dragClass } = useReorderDrag(commitReorder);

  const summaryOf = (item, kind) => {
    if (kind === 'supplement') return formatSchedule(item.schedule) || 'Daily';
    const verdict = VERDICTS.find((v) => v.value === (item.verdict || null));
    return `${categoryOf(item.category).label}${verdict.value ? ` · ${verdict.label}` : ''}`;
  };

  const renderPanel = (item, kind, hidden) => {
    const segmented = (options, current, onPick) => (
      <div className="lr-seg">
        {options.map((o) => (
          <button key={String(o.value)} className={current === o.value ? 'on' : ''} onClick={() => onPick(o.value)}>{o.label}</button>
        ))}
      </div>
    );
    const schedule = scheduleDraft ?? item.schedule;
    return (
      <div className="lr-panel">
        {!isDesktop && renderFields(item, kind)}
        {!isDesktop && kind === 'supplement' && <div className="lr-field"><label>Dose</label>{renderDose(item)}</div>}
        {kind === 'supplement' ? (
          <>
            <div className="lr-field top">
              <label>Schedule</label>
              <div className="lr-schedule">
                <SchedulePicker schedule={schedule} onChange={setScheduleDraft} />
                {scheduleDraft && (
                  <div className="lr-prow" style={{ marginTop: 8 }}>
                    <button className="dn-btn primary" onClick={() => { patchSupplement(item.id, { schedule: scheduleDraft }); setScheduleDraft(null); }}>Save schedule</button>
                    <button className="dn-btn" onClick={() => setScheduleDraft(null)}>Cancel</button>
                  </div>
                )}
              </div>
            </div>
            <div className="lr-field">
              <label>Decay rate</label>
              <select className="lr-input boxed" value={item.halfLifeCategory || ''} onChange={(e) => patchSupplement(item.id, { halfLifeCategory: e.target.value || null })}>
                <option value="">Auto / Default (Moderate)</option>
                <option value="fast">Fast (~12 hours)</option>
                <option value="moderate">Moderate (~3 days)</option>
                <option value="slow">Slow (~21 days)</option>
              </select>
              <small>Used by the body-level chart</small>
            </div>
          </>
        ) : (
          <>
            <div className="lr-field"><label>Category</label>{segmented(INPUT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), item.category, (v) => patchFactor(item.id, { category: v }))}</div>
            <div className="lr-field"><label>Verdict</label>{segmented(VERDICTS, item.verdict || null, (v) => patchFactor(item.id, { verdict: v }))}</div>
            <div className="lr-field">
              <label>Amount unit</label>
              <input className="lr-input boxed" placeholder="e.g. drinks, squares (optional)" defaultValue={item.unit || ''} maxLength={24}
                onBlur={(e) => { const u = e.target.value.trim(); if (u !== (item.unit || '')) patchFactor(item.id, { unit: u || null }); }} />
            </div>
            <div className="lr-field">
              <label>Daily check-in</label>
              {segmented([{ value: true, label: 'Ask in Rapid entry' }, { value: false, label: 'Don’t ask' }], item.askDaily !== false, (v) => patchFactor(item.id, { askDaily: v }))}
            </div>
          </>
        )}
        <ChangeLog
          history={item.history}
          format={kind === 'supplement' ? (e) => formatSupplementChange(e, item.unit) : formatInputChange}
          onRevert={kind === 'supplement' ? (index) => revertSupplement(item, index) : null}
        />
        {!isDesktop && <div className="lr-prow">{renderActions(item, kind, hidden)}</div>}
      </div>
    );
  };

  const renderFields = (item, kind) => (
    <div className="lr-fields">
      <DraftInput className="lr-input name" value={item.name} placeholder="Name" onCommit={(v) => v.trim() && patch(kind, item.id, { name: v.trim() })} />
      <DraftInput className="lr-input desc" value={item.description} placeholder="Add a description" onCommit={(v) => patch(kind, item.id, { description: v.trim() })} />
    </div>
  );

  const renderDose = (item) => (
    <div className="lr-dosefields">
      <DraftInput className="lr-input num" inputMode="decimal" value={item.defaultDose} onCommit={(v) => commitDefaultDose(item, v)} />
      <select className="lr-input unit" value={item.unit} onChange={(e) => patchSupplement(item.id, { unit: e.target.value })}>
        {(UNITS.includes(item.unit) ? UNITS : [item.unit, ...UNITS]).map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );

  const renderActions = (item, kind, hidden) => hidden ? (
    <>
      <button className="lr-link" onClick={() => patch(kind, item.id, { active: true })}>Restore</button>
      {onDeleteItem && <button className="lr-link danger" onClick={() => onDeleteItem(item, kind)}>Delete</button>}
    </>
  ) : (
    <button className="lr-link" onClick={() => { patch(kind, item.id, { active: false }); setLastAction(`${item.name} hidden (history preserved)`); }}>Hide</button>
  );

  const renderEditRow = ({ item, kind }, hidden) => {
    const expanded = expandedId === item.id;
    const toggleExpand = () => setExpandedId(expanded ? null : item.id);
    const summary = summaryOf(item, kind);
    return (
      <div
        key={item.id}
        className={`lr-row lr-cols ${hidden ? 'lr-hidden' : ''} ${expanded ? 'expanded' : ''} ${dragClass(item.id)}`}
        data-reorder-id={hidden ? undefined : item.id}
        data-reorder-group={hidden ? undefined : kind}
      >
        {hidden ? <span /> : <span className="lr-grip" {...gripProps(item.id, kind)}>⠿</span>}
        {isDesktop ? (
          <>
            {renderFields(item, kind)}
            {kind === 'supplement' ? renderDose(item) : <span />}
            <button className="lr-chip" onClick={toggleExpand}>{summary}</button>
            <div className="lr-rowacts">
              <button className="lr-link" onClick={toggleExpand}>{expanded ? 'Close' : 'More'}</button>
              {renderActions(item, kind, hidden)}
            </div>
          </>
        ) : (
          <>
            <div className="lr-name" onClick={toggleExpand}>
              {item.name || 'Untitled'}
              <small>{kind === 'supplement' ? `${item.defaultDose} ${item.unit} · ` : ''}{summary}</small>
            </div>
            <span />
            <button className="lr-link" onClick={toggleExpand}>{expanded ? '▴' : '▾'}</button>
          </>
        )}
        {expanded && renderPanel(item, kind, hidden)}
      </div>
    );
  };

  const renderAddRow = (kind, label) => adding === kind ? (
    <div className="lr-row lr-cols lr-add">
      <span className="lr-grip" style={{ cursor: 'default' }}>+</span>
      <div className="lr-fields">
        <DraftInput className="lr-input name" value="" placeholder={`New ${kind} name`} autoFocus onCommit={(v) => addItem(kind, v)} onAbandon={() => setAdding(null)} />
      </div>
    </div>
  ) : (
    <div className="lr-row lr-cols lr-add" onClick={() => setAdding(kind)}>
      <span className="lr-grip" style={{ cursor: 'pointer' }}>+</span><div>{label}</div>
    </div>
  );

  // ---- Render ----
  const rootClass = `lr lr-protocol ${isDesktop ? 'desktop' : 'mobile'} ${editing ? 'edit' : ''}`;

  // Scope + actions live in the nav's context bar (desktop) or the second row of the mobile top bar
  // Desktop bar mirrors Symptoms: nothing on the left, actions on the right with Edit last
  // Mobile's edit mode keeps its count and Done in the top bar; desktop has no mode and no bar buttons
  const bar = barSlot && editing ? createPortal(
    <>
      <span className="dn-progress"><b>{activeSupplements.length + activeFactors.length}</b> active</span>
      <span className="lr-spacer" />
      <button className="dn-btn primary" onClick={() => { setEditing(false); setExpandedId(null); }}>Done</button>
    </>,
    barSlot
  ) : null;

  const isSel = (kind, id) => !!selection && selection.kind === kind && selection.id === id;
  const tagFor = (kind, id) => planTags?.get(`${kind}:${id}`);
  const open = (kind, id) => onSelect?.(isSel(kind, id) ? null : { kind, id });

  if (editing) {
    const visibleHidden = showAllHidden ? hiddenRows : hiddenRows.slice(0, HIDDEN_PREVIEW);
    return (
      <div className={rootClass}>
        {bar}
        <div className="lr-sec"><b>SUPPLEMENTS</b> {activeSupplements.length} active</div>
        {activeSupplements.map((item) => renderEditRow({ item, kind: 'supplement' }, false))}
        {renderAddRow('supplement', 'Add supplement')}
        <div className="lr-sec"><b>OTHER FACTORS</b> {activeFactors.length} active</div>
        {activeFactors.map((item) => renderEditRow({ item, kind: 'factor' }, false))}
        {renderAddRow('factor', 'Add factor')}
        {hiddenRows.length > 0 && (
          <>
            <div className="lr-sec">HIDDEN · {hiddenRows.length} · history is kept</div>
            {visibleHidden.map((row) => renderEditRow(row, true))}
            {hiddenRows.length > HIDDEN_PREVIEW && (
              <div className="lr-row lr-cols lr-showmore" onClick={() => setShowAllHidden((v) => !v)}>
                <span /><div>{showAllHidden ? 'Show fewer' : `Show ${hiddenRows.length - HIDDEN_PREVIEW} more`}</div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const renderStrip = (id, entryMap, schedule, onClick) => (
    <div className="lr-strip check" title={onClick ? 'Open chart' : undefined} onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} style={onClick ? undefined : { cursor: 'default' }}>
      {stripKeys.map((k) => {
        const e = entryMap[`${k}-${id}`];
        const on = !!e && e.logged !== false;
        const skip = !on && schedule && !isScheduledForDate(schedule, new Date(`${k}T12:00:00`));
        return <i key={k} className={on ? 'y' : skip ? 'skip' : ''} />;
      })}
    </div>
  );

  // Mobile: swipe a row left for Edit (the item's own page) and Hide
  const swipeActions = (item, kind) => (isDesktop ? null : [
    ...(onEditItem && kind === 'supplement' ? [{ label: 'Edit', icon: swipeIcons.edit, onClick: () => onEditItem(item) }] : []),
    { label: 'Hide', icon: swipeIcons.hide, tone: 'warn', onClick: () => { patch(kind, item.id, { active: false }); setLastAction(`${item.name} hidden (history kept)`); } },
  ]);

  // Mobile: tick every unticked supplement in one time-of-day section
  const checkSection = (items) => {
    haptic('light');
    setStackEntries((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const key = `${dateKey}-${item.id}`;
        if (!next[key]) next[key] = { date: dateKey, itemId: item.id, dose: item.defaultDose || 0, taken: true };
      });
      return next;
    });
  };

  const renderSupplementRow = (item, due) => (
    <SwipeRow key={item.id} actions={swipeActions(item, 'supplement')}>{renderSupplementRowInner(item, due)}</SwipeRow>
  );
  const renderSupplementRowInner = (item, due) => {
    const entry = stackEntries[`${dateKey}-${item.id}`];
    const focused = isDesktop && focusId === item.id;
    const dueLabel = !due ? nextDueLabel(item.schedule, selectedDate) : null;
    return (
      <div
        key={item.id}
        className={`lr-row lr-cols ${isDesktop ? '' : 'lr-two'} ${focused ? 'focus' : ''} ${entry ? 'done' : ''} ${due ? '' : 'muted'} ${isSel('supplement', item.id) ? 'sel' : ''}`}
        data-reorder-id={isDesktop && due ? `s:${item.id}` : undefined}
        data-reorder-group={isDesktop && due ? 'protocol' : undefined}
        onMouseMove={isDesktop && due && !focused ? () => setFocusId(item.id) : undefined}
        onClick={() => { if (due) setFocusId(item.id); if (!isDesktop) toggleSupplement(item); else open('supplement', item.id); }}
      >
        {isDesktop && due && <span className="lr-grip lr-gutter" title="Drag to reorder, or into the other group" onClick={(e) => e.stopPropagation()} {...gripProps(`s:${item.id}`, 'protocol')}>⠿</span>}
        {isDesktop ? (
          <div className="lr-name">{item.name}{tagFor('supplement', item.id) && <i className="lr-plandot" title={`On your plan · ${tagFor('supplement', item.id)}`} />}{item.description && <small>{item.description}</small>}</div>
        ) : (
          <div className="lr-name">
            {item.name}
            <small className="lr-sub">
              {dosingId === item.id ? (
                <span className="lr-dose editing" onClick={(e) => e.stopPropagation()}>
                  <DraftInput className="lr-input num boxed" inputMode="decimal" autoFocus value={entry?.dose ?? item.defaultDose} onCommit={(v) => setDose(item, v)} onAbandon={() => setDosingId(null)} />{item.unit}
                </span>
              ) : (
                <button type="button" className="lr-dose" onClick={(e) => { e.stopPropagation(); setDosingId(item.id); }}>
                  <b>{entry?.dose ?? item.defaultDose}</b>{item.unit}
                </button>
              )}
              {item.description && <span className="lr-desc"> · {item.description}</span>}
            </small>
          </div>
        )}
        {isDesktop && renderStrip(item.id, stackEntries, item.schedule, onOpenSupplementGraph ? () => onOpenSupplementGraph(item.id) : null)}
        {!isDesktop ? null : dosingId === item.id ? (
          <div className="lr-dose editing" onClick={(e) => e.stopPropagation()}>
            <DraftInput className="lr-input num boxed" inputMode="decimal" autoFocus value={entry?.dose ?? item.defaultDose} onCommit={(v) => setDose(item, v)} onAbandon={() => setDosingId(null)} />{item.unit}
          </div>
        ) : (
          <button className="lr-dose" onClick={(e) => { e.stopPropagation(); setDosingId(item.id); }}>
            <b>{entry?.dose ?? item.defaultDose}</b>{item.unit}
          </button>
        )}
        {due || entry ? (
          <button className={`lr-pill ${entry ? 'on' : 'empty'}`} onClick={(e) => { e.stopPropagation(); setFocusId(item.id); toggleSupplement(item); }}>✓</button>
        ) : (
          <button className="lr-due" title="Log anyway" onClick={(e) => { e.stopPropagation(); toggleSupplement(item); }}>{dueLabel ? `due ${dueLabel}` : 'log'}</button>
        )}
      </div>
    );
  };

  const renderFactorRow = (item) => (
    <SwipeRow key={item.id} actions={swipeActions(item, 'factor')}>{renderFactorRowInner(item)}</SwipeRow>
  );
  const renderFactorRowInner = (item) => {
    const raw = inputEntries[`${dateKey}-${item.id}`];
    const entry = isYes(raw) ? raw : null;
    const count = countOf(raw);
    const focused = isDesktop && focusId === item.id;
    return (
      <div
        key={item.id}
        className={`lr-row lr-cols ${focused ? 'focus' : ''} ${entry ? 'done' : ''} ${isSel('factor', item.id) ? 'sel' : ''}`}
        data-reorder-id={isDesktop ? `f:${item.id}` : undefined}
        data-reorder-group={isDesktop ? 'protocol' : undefined}
        onMouseMove={isDesktop && !focused ? () => setFocusId(item.id) : undefined}
        onClick={() => { setFocusId(item.id); if (!isDesktop) setFactorCount(item, count ? 0 : 1); else open('factor', item.id); }}
      >
        {isDesktop && <span className="lr-grip lr-gutter" title="Drag to reorder, or into the other group" onClick={(e) => e.stopPropagation()} {...gripProps(`f:${item.id}`, 'protocol')}>⠿</span>}
        <div className="lr-name">
          {item.name}
          {tagFor('factor', item.id) && <i className="lr-plandot" title={`On your plan · ${tagFor('factor', item.id)}`} />}
          {item.verdict && <span className="lr-verdict" style={{ color: VERDICT_COLORS[item.verdict], borderColor: `${VERDICT_COLORS[item.verdict]}55` }}>{item.verdict}</span>}
          {item.description && <small>{item.description}</small>}
        </div>
        {isDesktop && renderStrip(item.id, inputEntries, null, null)}
        {count > 0 ? (
          <div className="lr-stepper" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setFactorCount(item, count - 1)}>−</button>
            <span>{amountLabel(item, count)}</span>
            <button onClick={() => setFactorCount(item, count + 1)}>+</button>
          </div>
        ) : isNo(raw) ? <span className="lr-no">No</span> : <span />}
        <button className={`lr-pill ${entry ? 'on' : 'empty'}`} onClick={(e) => { e.stopPropagation(); setFocusId(item.id); setFactorCount(item, count ? 0 : 1); }}>✓</button>
      </div>
    );
  };

  // Desktop: one quiet line for what isn't on today's checklist (off-schedule, or not started yet)
  const upSupps = (upcoming || []).filter((u) => u.kind === 'supplement');
  const upFactors = (upcoming || []).filter((u) => u.kind === 'food' || u.kind === 'intervention');
  const shortDate = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const renderMore = (notDue, soon) => {
    if (!notDue.length && !soon.length) return null;
    const label = [notDue.length && `${notDue.length} not due today`, soon.length && `${soon.length} starting soon`].filter(Boolean).join(' · ');
    const isOpen = showMore || !!search;
    return (
      <>
        <div className="lr-fold" onClick={() => setShowMore((v) => !v)}>{isOpen ? '▾' : '▸'} {label}</div>
        {isOpen && notDue.map((item) => renderSupplementRow(item, false))}
        {isOpen && soon.map((u) => (
          <div key={u.itemId} className={`lr-row lr-cols muted ${selection?.planId === u.itemId || (u.linked?.id && isSel(u.linked.kind, u.linked.id)) ? 'sel' : ''}`} onClick={() => onSelect?.(selection?.planId === u.itemId ? null : { planId: u.itemId })}>
            <div className="lr-name">{u.name}</div>
            <span /><span />
            <span className="lr-due">{u.startDate ? `starts ${shortDate(u.startDate)}` : 'not started'}</span>
          </div>
        ))}
      </>
    );
  };

  const deskDone = (r) => (r.kind === 'supplement' ? !!stackEntries[`${dateKey}-${r.item.id}`] : isYes(inputEntries[`${dateKey}-${r.item.id}`]));
  const showS = isDesktop || tab === 's';
  const showF = isDesktop || tab === 'f';
  return (
    <div className={rootClass}>
      {bar}
      {!isDesktop && (
        <div className="lr-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 's'} className={tab === 's' ? 'on' : ''} onClick={() => setTab('s')}>Supplements <span>{takenCount}/{dueItems.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'f'} className={tab === 'f' ? 'on' : ''} onClick={() => setTab('f')}>Other factors <span>{loggedCount}/{factors.length}</span></button>
        </div>
      )}
      {showS && !isDesktop && dueItems.length > 0 && (
        <div className="lr-prog"><i style={{ width: `${Math.round((takenCount / dueItems.length) * 100)}%` }} /></div>
      )}
      {showS && !isDesktop && dueItems.length === 0 && otherItems.length === 0 && !(search && hiddenMatches.length) && (
        <div className="lr-empty">{search ? `Nothing matches "${search}"` : 'No supplements yet. Tap + to add one.'}</div>
      )}
      {showS && !isDesktop && timeSections.map((sec) => [
        sec.label && (
          <div key={`t-${sec.id}`} className="lr-sec lr-tsec">
            <b>{sec.label.toUpperCase()}</b>
            {sec.items.some((i) => !stackEntries[`${dateKey}-${i.id}`]) && <button type="button" onClick={() => checkSection(sec.items)}>Check all</button>}
          </div>
        ),
        ...sec.items.map((item) => renderSupplementRow(item, true)),
      ])}
      {showS && !isDesktop && otherItems.map((item) => renderSupplementRow(item, false))}
      {showF && !isDesktop && factors.length === 0 && !(search && hiddenMatches.length) && <div className="lr-empty">{search ? `Nothing matches "${search}"` : 'No factors yet.'}</div>}
      {showF && !isDesktop && factors.map(renderFactorRow)}
      {isDesktop && [['supp', 'SUPPLEMENTS', 'taken'], ['life', 'DIET AND LIFESTYLE', isToday ? 'today' : 'logged']].map(([sec, title, word]) => {
        const rows = deskSections[sec];
        const done = rows.filter(deskDone).length;
        const untakenSupps = rows.some((r) => r.kind === 'supplement' && !deskDone(r));
        return (
          <div key={sec}>
            <div className="lr-sec" data-reorder-id={`group:${sec}`} data-reorder-group="protocol">
              <b>{title}</b> {done} of {rows.length} {word}
              {sec === 'supp' && untakenSupps && <button type="button" className="lr-secact" onClick={onCheckAll}>Check all</button>}
            </div>
            {rows.length === 0 && <div className="lr-fold lr-hintline">{search ? `Nothing matches "${search}"` : sec === 'supp' ? 'No supplements yet. Add one below.' : 'Foods, habits and activities to check off each day. Add one below, or drag one here.'}</div>}
            {rows.map((r) => (r.kind === 'supplement' ? renderSupplementRow(r.item, true) : renderFactorRow(r.item)))}
            {sec === 'supp' ? renderMore(otherItems, upSupps) : renderMore([], upFactors)}
            {renderAddRow(sec === 'supp' ? 'supplement' : 'factor', sec === 'supp' ? 'Add supplement' : 'Add item')}
          </div>
        );
      })}
      <HiddenSearchResults matches={hiddenMatches} onRestore={(m) => {
        if (m.deleted) onRestoreDeleted?.(m.kind, m.item);
        else { patch(m.kind, m.item.id, { active: true }); setLastAction(`Restored ${m.item.name}`); }
      }} />
      {isDesktop && hiddenRows.length > 0 && (
        <>
          <div className="lr-fold lr-foldsec" onClick={() => setShowHidden((v) => !v)}>{showHidden ? '▾' : '▸'} Hidden · {hiddenRows.length} · history is kept</div>
          {showHidden && hiddenRows.map(({ item, kind }) => (
            <div key={item.id} className={`lr-row lr-cols lr-hiddenrow ${isSel(kind, item.id) ? 'sel' : ''}`} onClick={() => open(kind, item.id)}>
              <div className="lr-name">{item.name}{item.description && <small>{item.description}</small>}</div>
              <span /><span />
              <button className="lr-link" onClick={(e) => { e.stopPropagation(); patch(kind, item.id, { active: true }); setLastAction(`Restored ${item.name}`); }}>Restore</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
