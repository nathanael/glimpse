// Pills: what's due today, a name, its dose and a big check.
//
// Drag a row left or right to set the dose (10% to 200% of the usual dose, in steps that suit its
// size); letting go marks it taken. The dose shows big on the row and in the top bar, where the
// finger can't hide it. Past either end of the range is an "other dose" zone: letting go there
// asks for a typed amount. Tapping a row opens the same control as a big dial; the check on the
// right takes it or not.
//
// The + bottom right logs something off the daily list: it opens on the supplements most often
// taken or switched on and off (no keyboard until the search field is tapped); typing a name that
// isn't there offers it as new, saved as a hidden supplement so it never lands on the daily list.
// Anything logged off the list shows under "Added today".
//
// It writes the record protocolCheckAll writes ({ date, itemId, dose, taken }), so sync, backup,
// tombstones and the supplement graphs are unaffected.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDateKey, isScheduledForDate, haptic, formatDate, createHistoryEntry } from '../utils/helpers';
import { makeId } from '../utils/listHelpers';
import { usualDoses, adHocChoices, doseAt, dosePos, doseRange, fmtDose } from '../utils/doseSlider';
import { primeKeyboard } from '../utils/primeKeyboard';
import { UNITS } from './AddFlow';
import './simpleProtocol.css';
import { CloseButton, useRiseIn, useDragDismiss } from './overlay';
import DayBar from './DayBar';
import { protocolDayStatus } from '../utils/dayStatus';

const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
const Plus = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
// "today", "yesterday", "5 days ago", "3 weeks ago" for the last time something was taken
const ago = (dateKey) => {
  const days = Math.round((new Date(new Date().toDateString()) - new Date(`${dateKey}T00:00:00`)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};

export default function SimpleProtocol({
  stackItems,
  setStackItems,
  stackEntries,
  setStackEntries,
  selectedDate,
  onSelectDate,   // (date): the day arrows move the day being checked off
  onFullDetail,   // the switch: the Advanced protocol list
  onHome,
  instant,        // opened by the switch: no rise-in, it just appears
  startAdding,    // open straight on the + sheet (Home's Add > Ad hoc supplement)
  onClose,
}) {
  const rootRef = useRef(null);
  useRiseIn(rootRef, instant);
  const dragDismiss = useDragDismiss(rootRef, onClose);

  const [drag, setDrag] = useState(null);       // { id, dose, over } while a finger drags a dose
  const [dialId, setDialId] = useState(null);   // the row opened as a dial
  const [other, setOther] = useState(null);     // { id } or { name } (a new one): typing a dose
  const [typed, setTyped] = useState('');
  const [newUnit, setNewUnit] = useState('mg');
  const [adding, setAdding] = useState(!!startAdding);  // the + sheet
  const [q, setQ] = useState('');
  const dragRef = useRef(null);
  const swallowClick = useRef(false);
  const sheetListRef = useRef(null);
  // The + sheet's list runs oldest at the top to most recent at the bottom, by the thumb: open it there
  useEffect(() => {
    const el = sheetListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [adding, q]);

  const dateKey = getDateKey(selectedDate);
  const keyFor = (id) => `${dateKey}-${id}`;
  const entryOf = (id) => stackEntries[keyFor(id)];
  const items = stackItems || [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const due = items.filter((i) => i.active && isScheduledForDate(i.schedule, selectedDate));
  const dueIds = new Set(due.map((i) => i.id));
  const extra = items.filter((i) => !dueIds.has(i.id) && entryOf(i.id));
  const taken = due.filter((i) => entryOf(i.id)).length;
  const logged = useMemo(() => usualDoses(items, stackEntries), [items, stackEntries]);
  // The daily list keeps its set dose; anything else uses the median of what was logged
  const usualOf = (item) => (dueIds.has(item.id) && parseFloat(item.defaultDose) > 0 ? parseFloat(item.defaultDose) : logged[item.id]?.usual || 1);
  const doseOf = (item) => { const e = entryOf(item.id); return e && parseFloat(e.dose) > 0 ? parseFloat(e.dose) : usualOf(item); };

  const take = (id, dose) => {
    setStackEntries((prev) => ({ ...prev, [keyFor(id)]: { date: dateKey, itemId: id, dose, taken: true } }));
  };
  const toggle = (item) => {
    const key = keyFor(item.id);
    setStackEntries((prev) => {
      if (prev[key]) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: { date: dateKey, itemId: item.id, dose: usualOf(item), taken: true } };
    });
    haptic('light');
  };

  const closeTop = () => {
    if (other) setOther(null);
    else if (dialId) setDialId(null);
    else if (adding) { setAdding(false); setQ(''); }
    else onClose();
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeTop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const askOther = (target) => { primeKeyboard(); setTyped(''); setOther(target); };

  // Pointer handlers that turn a sideways drag into a dose. A tap stays a tap; a vertical move
  // is left to the list's scrolling.
  const dragProps = (item, { start, onDose, live = false }) => ({
    onPointerDown: (e) => {
      if (e.button > 0) return;
      swallowClick.current = false;
      const r = e.currentTarget.getBoundingClientRect();
      dragRef.current = { item, usual: usualOf(item), start, x: e.clientX, y: e.clientY, w: r.width, moved: live, dead: false, dose: start, over: null };
      if (live) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ } }
    },
    onPointerMove: (e) => {
      const d = dragRef.current;
      if (!d || d.dead) return;
      if (!d.moved) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { d.dead = true; return; }
        if (Math.abs(dx) < 8) return;
        d.moved = true; d.x = e.clientX;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
        setDrag({ id: item.id, dose: d.start, over: null });
        return;
      }
      const { min, max } = doseRange(d.usual);
      const { dose, over } = doseAt(d.usual, d.start + ((e.clientX - d.x) / d.w) * (max - min));
      if (dose !== d.dose || over !== d.over) {
        if (dose !== d.dose || (over && !d.over)) haptic('light');
        d.dose = dose; d.over = over;
        setDrag({ id: item.id, dose, over });
      }
    },
    onPointerUp: () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !d.moved) return;
      swallowClick.current = true;
      setDrag(null);
      if (d.over) askOther({ id: item.id, then: onDose });
      else if (d.dose !== d.start || !live) onDose(d.dose);
    },
    onPointerCancel: () => { dragRef.current = null; setDrag(null); },
  });
  const tapProps = (fn) => ({ onClick: () => { if (swallowClick.current) { swallowClick.current = false; return; } fn(); } });

  // ---- the + sheet ----
  const shownIds = new Set([...dueIds, ...extra.map((i) => i.id)]);
  const choices = adding ? adHocChoices(items, { usual: logged, excludeIds: shownIds, query: q, limit: q.trim() ? 7 : Infinity }) : [];
  const typedName = q.trim();
  const exists = typedName && items.some((i) => i.name.toLowerCase() === typedName.toLowerCase());
  const closeAdd = () => { setAdding(false); setQ(''); };
  const addLogged = (item, dose) => { take(item.id, dose); closeAdd(); };
  const addNew = () => { setNewUnit('mg'); askOther({ name: typedName.replace(/^./, (c) => c.toUpperCase()) }); };

  const saveOther = () => {
    const dose = parseFloat(typed);
    if (!(dose > 0)) return;
    if (other.name) {
      const order = Math.max(-1, ...items.map((i) => i.order || 0)) + 1;
      // Hidden from the start: an ad hoc supplement is logged on the day, never due
      const item = {
        id: makeId(other.name), name: other.name, unit: newUnit, defaultDose: dose, description: '',
        schedule: { type: 'daily', startDate: dateKey }, active: false, order,
      };
      item.history = [createHistoryEntry(item)];
      setStackItems((prev) => [...prev, item]);
      take(item.id, dose);
      closeAdd();
    } else if (other.then) {
      other.then(dose);
    } else {
      take(other.id, dose);
    }
    setOther(null);
    haptic('light');
  };

  // ---- what's on screen ----
  const dragItem = drag ? byId.get(drag.id) : null;
  const dialItem = dialId ? byId.get(dialId) : null;
  const otherItem = other?.id ? byId.get(other.id) : null;

  const row = (item) => {
    const on = !!entryOf(item.id);
    const live = drag?.id === item.id;
    const v = live ? drag.dose : doseOf(item);
    const changed = v !== usualOf(item);
    return (
      <div key={item.id} className={`sck-row${on ? ' on' : ''}${live ? ' act' : ''}${live && drag.over ? ' ovr' : ''}`}>
        {live && <i className="sck-fill" style={{ width: drag.over ? '100%' : pct(dosePos(usualOf(item), v)) }} />}
        <button
          type="button"
          className="sck-bd"
          aria-label={`${item.name}, ${fmtDose(v)} ${item.unit || ''}. Drag sideways to change the dose, tap for the dial`}
          {...dragProps(item, { start: doseOf(item), onDose: (dose) => take(item.id, dose) })}
          {...tapProps(() => setDialId(item.id))}
        >
          <span className="sck-tx">
            <b>{item.name}</b>
            <small className={live ? (drag.over ? 'big o' : 'big') : changed ? 'ch' : ''}>
              {live && drag.over ? 'Other dose…' : `${fmtDose(v)} ${item.unit || ''}`}
            </small>
          </span>
        </button>
        <button type="button" className="sck-ck" aria-label={on ? `Untake ${item.name}` : `Take ${item.name}`} aria-pressed={on} onClick={() => toggle(item)}><i><Check /></i></button>
      </div>
    );
  };

  const hud = drag && dragItem && (
    <div className={`sck-hud${drag.over ? ' ovr' : ''}`} aria-live="polite">
      {drag.over ? <b>Choose a different dose</b> : <b>{fmtDose(drag.dose)}<small>{dragItem.unit}</small></b>}
    </div>
  );

  let dial = null;
  if (dialItem) {
    const usual = usualOf(dialItem);
    const live = drag?.id === dialItem.id;
    const v = live ? drag.dose : doseOf(dialItem);
    const over = live && drag.over;
    const on = !!entryOf(dialItem.id);
    const { step, min, max } = doseRange(usual);
    const n = Math.round((max - min) / step), every = Math.max(1, Math.round(n / 40));
    const ticks = [];
    for (let k = 0; k <= n; k += every) {
      const tv = min + k * step;
      ticks.push(<i key={k} className={Math.abs(tv - usual) < step / 2 ? 'm' : k % (5 * every) === 0 ? 'mj' : ''} style={{ left: pct(k / n) }} />);
    }
    dial = (
      <>
        <button type="button" className="sck-scrim" aria-label="Close" onClick={() => setDialId(null)} />
        <div className="sck-dial" role="dialog" aria-label={dialItem.name}>
          <div className="sck-dh"><span>{dialItem.name}</span><CloseButton onClick={() => setDialId(null)} delay={0} /></div>
          <button
            type="button"
            className={`sck-pad${over ? ' ovr' : ''}`}
            aria-label="Drag left or right to set the dose"
            {...dragProps(dialItem, { start: doseOf(dialItem), onDose: (dose) => take(dialItem.id, dose), live: true })}
          >
            <span className="sck-big">{over ? 'Other dose' : <>{fmtDose(v)}<small>{dialItem.unit}</small></>}</span>
            <span className="sck-pc">{over ? 'Choose a different dose' : `Usual ${fmtDose(usual)} ${dialItem.unit || ''}`}</span>
            <span className="sck-rl">{ticks}<b style={{ left: over ? (drag.over === 'hi' ? '100%' : '0%') : pct(dosePos(usual, v)) }} /></span>
            <span className="sck-ends"><span>{fmtDose(min)}</span><span>{fmtDose(max)} {dialItem.unit}</span></span>
          </button>
          <button type="button" className={`sck-take${on ? ' on' : ''}`} onClick={() => toggle(dialItem)}><Check />{on ? 'Taken' : 'Take'}</button>
        </div>
      </>
    );
  }

  return (
    <div className="sck" ref={rootRef}>
      <div className="sck-in">
        {hud || (
          <div className="sck-bar ui-drag" {...dragDismiss}>
            <h2>Pills</h2>
            <span>{onHome ? (due.length > 0 && `${taken} of ${due.length} taken`) : <>{formatDate(selectedDate)}{due.length > 0 && ` · ${taken} of ${due.length}`}</>}</span>
            {!onHome && <CloseButton label="Close checklist" onClick={onClose} />}
          </div>
        )}

        <div className="sck-list">
          {due.length === 0 && extra.length === 0 ? (
            <p className="sck-empty">Nothing scheduled this day.</p>
          ) : due.map(row)}
          {extra.length > 0 && <span className="sck-sec">Added today</span>}
          {extra.map(row)}
        </div>

        {onHome ? (
          <div className="sck-foot">
            <DayBar
              selectedDate={selectedDate}
              onSelect={onSelectDate}
              status={(d) => protocolDayStatus(stackItems, stackEntries, d)}
              onHome={onHome}
              onSwitch={onFullDetail}
              switchLabel="Advanced protocol"
            />
          </div>
        ) : (
          <div className="sck-foot">
            <button type="button" className="sck-full" onClick={onFullDetail}>Full detail →</button>
          </div>
        )}
      </div>

      {!dialItem && !adding && <button type="button" className="sck-fab" aria-label="Add a supplement taken today" onClick={() => setAdding(true)}><Plus /></button>}

      {adding && (
        <div className="sck-sheet" role="dialog" aria-label="Add a supplement">
          {hud}
          <div className="sck-list end" ref={sheetListRef}>
            {choices.length === 0 && !typedName && <p className="sck-empty">Nothing off your list yet. Type a name to add one.</p>}
            {[...choices].reverse().map((item) => {
              const live = drag?.id === item.id;
              const usual = usualOf(item);
              const v = live ? drag.dose : usual;
              return (
                <div key={item.id} className={`sck-row res${live ? ' act' : ''}${live && drag.over ? ' ovr' : ''}`}>
                  {live && <i className="sck-fill" style={{ width: drag.over ? '100%' : pct(dosePos(usual, v)) }} />}
                  <button
                    type="button"
                    className="sck-bd"
                    {...dragProps(item, { start: usual, onDose: (dose) => addLogged(item, dose) })}
                    {...tapProps(() => { addLogged(item, usual); setDialId(item.id); })}
                  >
                    <span className="sck-tx">
                      <b>{item.name}</b>
                      <small className={live ? (drag.over ? 'big o' : 'big') : ''}>{live && drag.over ? 'Other dose…' : `${fmtDose(v)} ${item.unit || ''}${!live && logged[item.id]?.last ? `  ·  ${ago(logged[item.id].last)}` : ''}`}</small>
                    </span>
                    <span className="sck-plus"><Plus /></span>
                  </button>
                </div>
              );
            })}
            {typedName && !exists && (
              <div className="sck-row res new">
                <button type="button" className="sck-bd" onClick={addNew}>
                  <span className="sck-tx"><b>{typedName}</b><small>New</small></span>
                  <span className="sck-plus"><Plus /></span>
                </button>
              </div>
            )}
          </div>
          <div className="sck-sf-row">
            <label className="sck-sf">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
              <input type="search" value={q} placeholder="Search or add new" aria-label="Search or add a supplement" autoComplete="off" autoCapitalize="words" onChange={(e) => setQ(e.target.value)} />
            </label>
            <button type="button" className="sck-cn" onClick={closeAdd}>Cancel</button>
          </div>
        </div>
      )}

      {dial}

      {other && (
        <>
          <button type="button" className="sck-scrim top" aria-label="Close" onClick={() => setOther(null)} />
          <form className="sck-dial top" role="dialog" aria-label="Type a dose" onSubmit={(e) => { e.preventDefault(); saveOther(); }}>
            <div className="sck-dh"><span>{other.name || otherItem?.name}</span><CloseButton onClick={() => setOther(null)} delay={0} /></div>
            <label className="sck-oth">
              <input type="text" inputMode="decimal" enterKeyHint="done" value={typed} placeholder="0" aria-label="Dose" autoFocus onChange={(e) => setTyped(e.target.value.replace(/[^0-9.]/g, ''))} />
              <span>{other.name ? newUnit : otherItem?.unit}</span>
            </label>
            {other.name && (
              <div className="sck-units">{UNITS.map((u) => <button key={u} type="button" className={u === newUnit ? 'on' : ''} onClick={() => setNewUnit(u)}>{u}</button>)}</div>
            )}
            <button type="submit" className="sck-take on" disabled={!(parseFloat(typed) > 0)}><Check />Take</button>
          </form>
        </>
      )}
    </div>
  );
}
