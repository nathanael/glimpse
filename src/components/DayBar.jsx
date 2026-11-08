// The one bottom bar every screen shares, always in the same place: Home on the left, the day
// with ‹ › arrows in the middle (the same picker as Sleep, minified), and the Simple/Advanced
// switch on the right. A screen without days or a switch keeps the slots empty, so Home and the
// switch never move.
import { getDateKey } from '../utils/helpers';
import './dayBar.css';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY_MS = 86400000;

function dayLabel(d) {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (diff === 0) return { label: 'Today', sub: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) };
  if (diff === 1) return { label: 'Yesterday', sub: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) };
  return { label: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), sub: `${diff} days ago` };
}

export default function DayBar({
  selectedDate,   // omit for a screen without days (Progress)
  onSelect,       // (date)
  status,         // (date) => 'full' | 'part' | ''
  onHome,
  onSwitch,       // omit where there is nothing to switch to
  switchLabel,    // e.g. 'Advanced tracking'
}) {
  const day = selectedDate ? startOfDay(selectedDate) : null;
  const isToday = day && day.getTime() >= startOfDay(new Date()).getTime();
  const shift = (n) => { const d = new Date(day); d.setDate(d.getDate() + n); onSelect(d); };
  const when = day ? dayLabel(day) : null;
  const s = day && status ? status(day) : '';

  return (
    <div className="db">
      <button type="button" className="db-ib" aria-label="Home" onClick={onHome}>
        <svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></svg>
      </button>
      <div className="db-sl">
        {day && (
          <nav className="db-nav" aria-label="Day">
            <button type="button" className="db-arr" aria-label="Previous day" onClick={() => shift(-1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <div className="db-date" aria-live="polite" key={getDateKey(day)}>
              <b>{when.label}{s && <i className={s} aria-label={s === 'full' ? 'done' : 'part done'} />}</b>
              <small>{when.sub}</small>
            </div>
            <button type="button" className="db-arr" aria-label="Next day" disabled={isToday} onClick={() => shift(1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </nav>
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
