import './desktopNav.css';
import './mobileNav.css';
import { formatDate } from '../utils/helpers';
import { getScoreColor } from '../utils/healthScore';
import { useHealthScore } from '../hooks/useHealthScore';


// Mobile top bar: the day on the left (tap for the calendar; the day chips at the bottom step
// days), or the Insights view switch; score and the ⋯ menu on the right.
// Row two is filled by the active list: progress left, its one primary action right.
export default function Header({
  selectedDate,
  changeDate,
  canGoForward,
  setShowCalendar,
  setCalendarMonth,
  symptoms,
  entries,
  trackingMode,
  showInsights,
  slotRef,
  onMore,      // the ⋯ menu (Settings, Copy for AI, Clear day, Edit list…)
  moreOn,
}) {
  const { score, delta, rollingAvg } = useHealthScore(selectedDate, { symptoms, entries, trackingMode });
  const scoreValue = score !== null ? score : rollingAvg;
  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="mn-top">
      <div className="mn-r1">
        {showInsights ? (
          <div className="dn-slot" ref={slotRef} />
        ) : (
          <>
            <button
              className="mn-date"
              onClick={() => {
                setCalendarMonth(new Date(selectedDate));
                setShowCalendar(true);
              }}
            >
              {formatDate(selectedDate)}
              {isToday && <small>{selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>}
            </button>
            <span style={{ marginLeft: 'auto' }} />
          </>
        )}
        {scoreValue !== null && (
          <div className="dn-score">
            <span className="dn-ring" style={{ background: `conic-gradient(${getScoreColor(scoreValue)} ${scoreValue}%, rgba(255,255,255,.08) 0)` }} />
            {scoreValue}%
            {delta !== null && delta !== 0 && (
              <small style={{ color: delta > 0 ? '#22c55e' : '#ef4444' }}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</small>
            )}
          </div>
        )}
        {onMore && (
          <button type="button" className={`mn-hmore${moreOn ? ' on' : ''}`} aria-label="More actions" aria-haspopup="menu" onClick={onMore}>
            <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
        )}
      </div>
      {!showInsights && <div className="mn-r2 dn-slot" ref={slotRef} />}
    </div>
  );
}
