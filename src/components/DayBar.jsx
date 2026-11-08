// The one bottom bar every screen shares, always in the same place: Home on the left, the last
// 30 days as chips you swipe through in the middle (today at the right end), and the
// Simple/Advanced switch on the right. A screen without days or a switch keeps the slots empty,
// so Home and the switch never move.
import { useLayoutEffect, useRef } from 'react';
import { getDateKey } from '../utils/helpers';
import './dayBar.css';

const DAYS = 30;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function DayBar({
  selectedDate,   // omit for a screen without days (Progress)
  onSelect,       // (date)
  status,         // (date) => 'full' | 'part' | ''
  onHome,
  onSwitch,       // omit where there is nothing to switch to
  switchLabel,    // e.g. 'Advanced tracking'
}) {
  const railRef = useRef(null);
  const today = startOfDay(new Date());
  const days = Array.from({ length: DAYS }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (DAYS - 1 - i)); return d; });
  const selKey = selectedDate ? getDateKey(selectedDate) : null;

  // Keep the chosen day in view: today on arrival, scrolled to if picked off-screen.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const on = rail.querySelector('.db-chip.on') || rail.lastElementChild;
    if (!on) return;
    const left = on.offsetLeft, right = left + on.offsetWidth;
    if (left < rail.scrollLeft || right > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = right - rail.clientWidth + 4;
  }, [selKey]);

  return (
    <div className="db">
      <button type="button" className="db-ib" aria-label="Home" onClick={onHome}>
        <svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></svg>
      </button>
      <div className="db-sl">
        {selectedDate && (
          <div className="db-rail" ref={railRef} role="group" aria-label="Day">
            {days.map((d, i) => {
              const key = getDateKey(d), on = key === selKey, isToday = i === DAYS - 1;
              const s = status ? status(d) : '';
              return (
                <button
                  key={key}
                  type="button"
                  className={`db-chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  aria-label={`${isToday ? 'Today' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}${s === 'full' ? ', done' : s === 'part' ? ', part done' : ''}`}
                  onClick={() => { if (!on) onSelect(d); }}
                >
                  <span>{isToday ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }).slice(0, 2)}</span>
                  <b>{d.getDate()}</b>
                  <i className={s || undefined} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className={`db-ib sw${onSwitch ? '' : ' off'}`}
        aria-label={switchLabel}
        aria-hidden={onSwitch ? undefined : 'true'}
        tabIndex={onSwitch ? undefined : -1}
        onClick={onSwitch}
      >
        <svg viewBox="0 0 24 24"><path d="M4 8h14l-4-4M20 16H6l4 4" /></svg>
      </button>
    </div>
  );
}
