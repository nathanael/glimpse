import './mobileNav.css';
import QuickActionsMenu from './QuickActionsMenu';
import { solar } from './solarIcons';
import { shatterSwitch } from './shatter';

const TABS = [
  { id: 'home', label: 'Home', icon: solar.home },
  { id: 'symptoms', label: 'Symptoms', icon: solar.symptoms },
  { id: 'stack', label: 'Protocol', icon: solar.protocol },
  { id: 'insights', label: 'Progress', icon: solar.progress },
];

// iOS only raises the keyboard for a focus() made inside the tap itself, and the note sheet's
// textarea mounts a render later. Focusing a throwaway input in the tap raises it; the textarea
// then takes the focus over and the keyboard stays up.
function primeKeyboard() {
  const el = document.createElement('input');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0';
  document.body.appendChild(el);
  el.focus();
  setTimeout(() => el.remove(), 1000);
}

// Mobile dock: the destinations in a pill, plus one overflow button beside it
export default function BottomNav({
  appMode,
  setAppMode,
  showInsights,
  setShowInsights,
  showSettings,
  setShowSettings,
  setShowExport,
  showQuickActions,
  setShowQuickActions,
  selectedDate,
  // Action handlers
  onCopyData,
  copyDays,
  onEditNote,
  onEditSymptoms,
  onClearSymptoms,
  onRapidEntry,
  onClear,
  onMatchYesterday,
  onEditProtocol,
  onLogMeal,
  onHomeRapidEntry,
  onHomeNote,
}) {
  const activeTab = showInsights ? 'insights' : appMode === 'home' ? 'home' : appMode === 'symptoms' ? 'symptoms' : 'stack';

  const goTo = (tab) => {
    if (tab === 'insights') {
      setShowInsights(true);
    } else {
      setAppMode(tab);
      setShowInsights(false);
    }
    setShowSettings(false);
    setShowExport(false);
    setShowQuickActions(false);
  };

  // On Home the tab pill folds into a single "Advanced mode" button; tapping it opens the
  // Symptoms tab and the pill unfolds back into the tabs. Tapping the Home tab folds it again.
  // Both layers stay mounted, stacked in one grid cell, so the swap can animate both ways.
  const easy = appMode === 'home' && !showInsights;

  // Leaving Home for Advanced mode, and coming back to it, the photographs shatter into the
  // other screen's blocks and back (shatter.js). Every other tab change is instant.
  const onTab = (tab, e) => {
    if (tab === 'home' && !easy) shatterSwitch({ toAdv: false, originEl: e.currentTarget, commit: () => goTo('home') });
    else goTo(tab);
  };

  return (
    <>
      <div className="mn-dock">
        <div className="mn-dock-in">
          <div className={`mn-tabs${easy ? ' easy' : ''}`}>
            <div className="mn-layer mn-tablist" role="tablist" aria-hidden={easy || undefined}>
              {TABS.map((tab, i) => (
                <button key={tab.id} role="tab" style={{ '--i': i }} tabIndex={easy ? -1 : 0} aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'on' : ''} onClick={(e) => onTab(tab.id, e)}>
                  <svg viewBox="0 0 24 24">{tab.icon}</svg><span>{tab.label}</span>
                </button>
              ))}
            </div>
            <button className="mn-layer mn-adv" tabIndex={easy ? 0 : -1} aria-hidden={!easy || undefined} aria-label="Advanced mode" onClick={(e) => shatterSwitch({ toAdv: true, originEl: e.currentTarget, commit: () => goTo('symptoms') })}>
              <svg viewBox="0 0 24 24">{solar.transfer}</svg>
            </button>
          </div>
          {/* Home only: the two things used most. Always mounted so they can fold away with the tabs */}
          <button
            className={`mn-quick mn-rapid${easy ? ' easy' : ''}`}
            tabIndex={easy ? 0 : -1}
            aria-hidden={!easy || undefined}
            aria-label="Check in: rapid entry for today's symptoms"
            onClick={onHomeRapidEntry}
          >
            <svg viewBox="0 0 24 24">{solar.bolt}</svg><span>Check-in</span>
          </button>
          <button
            className={`mn-quick mn-note${easy ? ' easy' : ''}`}
            tabIndex={easy ? 0 : -1}
            aria-hidden={!easy || undefined}
            aria-label="Write a note"
            onClick={() => { primeKeyboard(); onHomeNote(); }}
          >
            <svg viewBox="0 0 24 24">{solar.note}</svg><span>Note</span>
          </button>
          <button className={`mn-more ${showQuickActions ? 'on' : ''}`} aria-label="More actions" aria-haspopup="menu" onClick={() => setShowQuickActions(!showQuickActions)}>
            <svg viewBox="0 0 24 24">{solar.more}</svg>
          </button>
        </div>
      </div>

      {showQuickActions && !showSettings && (
        <QuickActionsMenu
          appMode={appMode}
          showInsights={showInsights}
          selectedDate={selectedDate}
          onClose={() => setShowQuickActions(false)}
          onCopyData={onCopyData}
          copyDays={copyDays}
          onEditNote={onEditNote}
          onEditSymptoms={onEditSymptoms}
          onClearSymptoms={onClearSymptoms}
          onRapidEntry={onRapidEntry}
          onClear={onClear}
          onMatchYesterday={onMatchYesterday}
          onEditProtocol={onEditProtocol}
          onLogMeal={onLogMeal}
          onOpenSettings={() => {
            setShowSettings(true);
            setShowQuickActions(false);
          }}
        />
      )}
    </>
  );
}
