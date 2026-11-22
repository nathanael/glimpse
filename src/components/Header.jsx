import './desktopNav.css';
import './mobileNav.css';
import { formatDate } from '../utils/helpers';


// Mobile top bar: the day on the left (tap for the calendar; the day chips at the bottom step
// days), or the Insights view switch; the ⋯ menu on the right.
// Row two is filled by the active list: progress left, its one primary action right.
export default function Header({
  selectedDate,
  changeDate,
  canGoForward,
  setShowCalendar,
  setCalendarMonth,
  showInsights,
  slotRef,
  onMore,      // the ⋯ menu (Settings, Copy for AI, Clear day, Edit list…)
  moreOn,
}) {
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
