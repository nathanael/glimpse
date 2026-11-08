// The simplified supplement view: what's due today, a name and a big check, nothing else.
// No doses, no time-of-day columns, no inputs section.
//
// It writes exactly the record protocolCheckAll writes, so sync, backup, tombstones and the
// supplement graphs are unaffected. No undo toast either — a mistap is undone by tapping the
// row again, which is faster than reaching for a toast.

import { useEffect, useRef } from 'react';
import { getDateKey, isScheduledForDate, haptic, formatDate } from '../utils/helpers';
import './simpleProtocol.css';
import { CloseButton, useRiseIn, useDragDismiss } from './overlay';
import WeekStrip from './WeekStrip';
import { solar } from './solarIcons';

export default function SimpleProtocol({
  stackItems,
  stackEntries,
  setStackEntries,
  selectedDate,
  onSelectDate,   // (date): the week strip moves the day being checked off
  onFullDetail,   // the Advanced Protocol tab
  onClose,
}) {
  const rootRef = useRef(null);
  useRiseIn(rootRef);
  const dragDismiss = useDragDismiss(rootRef, onClose);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dateKey = getDateKey(selectedDate);
  const due = (stackItems || []).filter((i) => i.active && isScheduledForDate(i.schedule, selectedDate));
  const keyFor = (item) => `${dateKey}-${item.id}`;
  const isTaken = (item) => !!stackEntries[keyFor(item)];
  const taken = due.filter(isTaken).length;

  // A day's dot: every due item taken, some, or none.
  const dayStatus = (d) => {
    const k = getDateKey(d);
    const items = (stackItems || []).filter((i) => i.active && isScheduledForDate(i.schedule, d));
    const n = items.filter((i) => stackEntries[`${k}-${i.id}`]).length;
    return !items.length || !n ? '' : n === items.length ? 'full' : 'part';
  };

  const toggle = (item) => {
    const key = keyFor(item);
    setStackEntries((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { date: dateKey, itemId: item.id, dose: item.defaultDose, taken: true } };
    });
    haptic('light');
  };

  return (
    <div className="sck" ref={rootRef}>
      <div className="sck-in">
        <div className="sck-bar ui-drag" {...dragDismiss}>
          <h2>{formatDate(selectedDate)}</h2>
          {due.length > 0 && <span>{taken} of {due.length}</span>}
          <CloseButton label="Close checklist" onClick={onClose} />
        </div>

        <div className="sck-list">
          {due.length === 0 ? (
            <p className="sck-empty">Nothing scheduled this day.</p>
          ) : due.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sck-row${isTaken(item) ? ' on' : ''}`}
              aria-pressed={isTaken(item)}
              onClick={() => toggle(item)}
            >
              <span>{item.name}</span>
              <i />
            </button>
          ))}
        </div>

        <div className="sck-foot">
          {onSelectDate && <WeekStrip selectedDate={selectedDate} onSelect={onSelectDate} status={dayStatus} />}
          <button type="button" className="adv-back" onClick={onFullDetail}>
            <svg viewBox="0 0 24 24">{solar.transfer}</svg>Advanced protocol
          </button>
        </div>
      </div>
    </div>
  );
}
