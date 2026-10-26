import './mobileNav.css';
import QuickActionsMenu from './QuickActionsMenu';
import { solar } from './solarIcons';
import { shatterSwitch } from './shatter';

const TABS = [
  { id: 'home', label: 'Home', icon: solar.home },
  { id: 'symptoms', label: 'Tracking', icon: solar.symptoms },
  { id: 'stack', label: 'Protocol', icon: solar.protocol },
  { id: 'insights', label: 'Progress', icon: solar.progress },
];

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

  // Home has no dock: its own grid holds Advanced and More. Leaving Home the dock rises into
  // place; coming back it drops away. Tapping the Home tab plays the shatter back to the photos.
  const away = appMode === 'home' && !showInsights;
  const onTab = (tab, e) => {
    if (tab === 'home') shatterSwitch({ toAdv: false, originEl: e.currentTarget, commit: () => goTo('home') });
    else goTo(tab);
  };

  return (
    <>
      <div className={`mn-dock${away ? ' away' : ''}`} aria-hidden={away || undefined} inert={away ? '' : undefined}>
        <div className="mn-dock-in">
          <div className="mn-tabs">
            <div className="mn-tablist" role="tablist">
              {TABS.map((tab) => (
                <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'on' : ''} onClick={(e) => onTab(tab.id, e)}>
                  <svg viewBox="0 0 24 24">{tab.icon}</svg><span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
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
