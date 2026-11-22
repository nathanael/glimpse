import { useEffect, useRef, useState } from 'react';
import './desktopNav.css';
import { formatDate } from '../utils/helpers';

// Sleep (only once Garmin nights exist) sits before Progress, which is always last
const tabsFor = (sleepAvailable) => [
  { id: 'symptoms', label: 'Tracking' },
  { id: 'stack', label: 'Protocol' },
  ...(sleepAvailable ? [{ id: 'sleep', label: 'Sleep' }] : []),
  { id: 'insights', label: 'Progress' },
];

const DAY_MS = 86400000;

// Garmin sync pill: dot colour tracks how fresh the newest night is
function garminStatus(sync, days) {
  const latest = days.reduce((max, d) => (d.date > max ? d.date : max), '');
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
  };
  if (!latest) {
    return { tone: 'off', label: 'No data', tip: sync.serverAvailable ? 'Garmin: nothing synced yet' : 'Garmin: server not detected on this machine' };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nights = Math.round((today - new Date(latest + 'T00:00:00')) / DAY_MS);
  const label = nights <= 0 ? 'Last night' : nights === 1 ? '1 night behind' : `${nights} nights behind`;
  const parts = [`Garmin: newest night ${latest}`];
  if (sync.lastSync) parts.push(`synced ${ago(sync.lastSync)}`);
  if (sync.error) parts.push(sync.error);
  return { tone: sync.error ? 'warn' : nights <= 0 ? 'ok' : 'warn', label, tip: parts.join(' · ') };
}

const Chevron = ({ points }) => <svg viewBox="0 0 24 24"><polyline points={points} /></svg>;

// One row: where am I (tabs), which day, the active view's own controls (portalled into the slot),
// then a single menu for everything occasional.
export default function DesktopToolbar({
  // Date navigation
  selectedDate,
  changeDate,
  canGoForward,
  setShowCalendar,
  setCalendarMonth,
  // Tab state
  appMode,
  setAppMode,
  showInsights,
  setShowInsights,
  // The active view portals its scope + actions into this node
  slotRef,
  // Action handlers
  settingsOpen,
  onCloseSettings,
  onOpenSettings,
  onCopyData,
  copyDays,
  onClearDay,        // clears the active list's day (Tracking or Protocol)
  onMatchYesterday,  // Protocol only
  onArrange,         // Tracking only: the arrange screen (order, groups)
  garminSync,
  garminSleepDays,
  showSleep,
  setShowSleep,
  showPlan,          // Protocol's Timeline view
  setShowPlan,
  sleepAvailable,
  editing,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const activeTab = showSleep ? 'sleep' : showInsights ? 'insights' : appMode === 'symptoms' ? 'symptoms' : 'stack';
  const timeline = activeTab === 'stack' && showPlan;

  const handleTabClick = (tab) => {
    onCloseSettings?.();
    setShowSleep?.(tab === 'sleep');
    if (tab === 'sleep') {
      setShowInsights(false);
    } else if (tab === 'insights') {
      setShowInsights(true);
    } else {
      setShowInsights(false);
      setAppMode(tab);
    }
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key); };
  }, [menuOpen]);

  const relativeLabel = formatDate(selectedDate);
  const fullDate = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  // A day only matters on the two daily lists; the timeline, Progress and Sleep carry their own range
  const showDay = !settingsOpen && !editing && !timeline && (activeTab === 'symptoms' || activeTab === 'stack');
  const dayList = !settingsOpen && !editing && !timeline && (activeTab === 'symptoms' || activeTab === 'stack');
  const item = (label, fn, cls = '') => (
    <button role="menuitem" className={cls} onClick={() => { setMenuOpen(false); fn(); }}>{label}</button>
  );

  return (
    <div className="dn-top">
      <div className="dn-wrap">
        <div className="dn-seg" role="tablist">
          {tabsFor(sleepAvailable).map((tab) => (
            <button key={tab.id} role="tab" aria-selected={!settingsOpen && activeTab === tab.id} className={!settingsOpen && activeTab === tab.id ? 'on' : ''} onClick={() => handleTabClick(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {showDay && (
          <>
            <div className="dn-step">
              <button aria-label="Previous day" onClick={() => changeDate(-1)}><Chevron points="15 18 9 12 15 6" /></button>
              <button
                className="dn-date"
                title="Open calendar"
                onClick={() => {
                  setCalendarMonth(new Date(selectedDate));
                  setShowCalendar(true);
                }}
              >
                {relativeLabel}
                {relativeLabel !== fullDate && <small>{fullDate}</small>}
              </button>
              <button aria-label="Next day" disabled={!canGoForward} onClick={() => changeDate(1)}><Chevron points="9 18 15 12 9 6" /></button>
            </div>
            {!isToday && (
              <button
                className="dn-btn ghost"
                onClick={() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  setShowCalendar(false);
                  changeDate(Math.round((today - new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())) / (1000 * 60 * 60 * 24)));
                }}
              >
                Today
              </button>
            )}
          </>
        )}

        {/* The active view's own controls */}
        <div className="dn-slot" ref={slotRef} />

        <div className="dn-right">
          {activeTab === 'stack' && !settingsOpen && !editing && (
            <div className="dn-seg sm" role="group" aria-label="Protocol view">
              <button className={timeline ? '' : 'on'} onClick={() => setShowPlan(false)}>Today</button>
              <button className={timeline ? 'on' : ''} onClick={() => setShowPlan(true)}>Timeline</button>
            </div>
          )}
          {/* Garmin sync status only matters on the Sleep tab */}
          {garminSync && activeTab === 'sleep' && (() => {
            const g = garminStatus(garminSync, garminSleepDays || []);
            return (
              <button className={`dn-garmin ${g.tone}${garminSync.syncing ? ' syncing' : ''}`} data-tip={garminSync.syncing ? 'Garmin: syncing…' : g.tip} aria-label={g.tip} onClick={onOpenSettings}>
                <span className="dn-dot" />Garmin<small>{garminSync.syncing ? 'Syncing…' : g.label}</small>
              </button>
            );
          })()}
          <div className="dn-menu-wrap" ref={menuRef}>
            <button className={`dn-icon ${menuOpen || settingsOpen ? 'on' : ''}`} aria-label="More" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>
            </button>
            {menuOpen && (
              <div className="dn-menu" role="menu">
                {dayList && activeTab === 'stack' && onMatchYesterday && item('Match yesterday', onMatchYesterday)}
                {dayList && onClearDay && item('Clear day', onClearDay)}
                {dayList && activeTab === 'symptoms' && onArrange && item('Arrange list and groups', onArrange)}
                {dayList && <hr />}
                {item(`Copy last ${copyDays} days for AI`, onCopyData)}
                {item(settingsOpen ? 'Close settings' : 'Settings', onOpenSettings)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
