// The last seven days as a row of buttons at the bottom of the simple screens (Pills, Check-in,
// Blood pressure), under the thumb: tap a day to log to it. Today is the far right; nothing past
// it. Each day carries a dot: filled when that day is done, dim when part-done, none when empty.
import { getDateKey } from '../utils/helpers';
import './weekStrip.css';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function WeekStrip({ selectedDate, onSelect, status }) {
  const today = startOfDay(new Date());
  const selKey = getDateKey(selectedDate);
  const days = [6, 5, 4, 3, 2, 1, 0].map((n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; });
  return (
    <div className="wk" role="group" aria-label="Day">
      {days.map((d, i) => {
        const key = getDateKey(d);
        const on = key === selKey;
        const s = status ? status(d) : '';
        const isToday = i === 6;
        return (
          <button
            key={key}
            type="button"
            className={`wk-d${on ? ' on' : ''}`}
            aria-pressed={on}
            aria-label={`${isToday ? 'Today' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}${s === 'full' ? ', done' : s === 'part' ? ', part done' : ''}`}
            onClick={() => { if (!on) onSelect(d); }}
          >
            <span>{isToday ? 'Today' : d.toLocaleDateString([], { weekday: 'short' })}</span>
            <b>{d.getDate()}</b>
            <i className={s || undefined} />
          </button>
        );
      })}
    </div>
  );
}
