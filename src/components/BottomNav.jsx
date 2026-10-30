import './mobileNav.css';
import QuickActionsMenu from './QuickActionsMenu';
import { solar } from './solarIcons';
import { shatterSwitch } from './shatter';

// Simple sits at the far right, under the thumb, for hopping back and forth with Advanced
const TABS = [
  { id: 'symptoms', label: 'Tracking', icon: solar.symptoms },
  { id: 'stack', label: 'Protocol', icon: solar.protocol },
  { id: 'insights', label: 'Progress', icon: solar.progress },
  { id: 'home', label: 'Simple', icon: solar.transfer },
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
  onEditProtocol,
  onLogMeal,
  onBloodPressure,
  bloodPressureHint,
  actions,        // { buttons: [{ label, onClick, primary }], onAdd, addLabel }: the list's bar above the tabs
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
  // place; coming back it drops away. Tapping the Simple tab plays the shatter back to the photos.
  const away = appMode === 'home' && !showInsights;
  const onTab = (tab, e) => {
    if (tab === 'home') shatterSwitch({ toAdv: false, originEl: e.currentTarget, commit: () => goTo('home') });
    else goTo(tab);
  };

  return (
    <>
      <div className={`mn-dock${away ? ' away' : ''}`} aria-hidden={away || undefined} inert={away ? '' : undefined}>
        {/* The list's day actions, and its + directly above the ⋯ so it is always in the same spot */}
        {actions && (
          <div className="mn-dock-in mn-acts">
            <div className="mn-acts-in">
              {actions.buttons.map((b) => (
                <button key={b.label} type="button" className={b.primary ? 'primary' : ''} onClick={b.onClick}>{b.label}</button>
              ))}
            </div>
            <button type="button" className="mn-add" aria-label={actions.addLabel} onClick={actions.onAdd}>
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        )}
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
          onEditProtocol={onEditProtocol}
          onLogMeal={onLogMeal}
          onBloodPressure={onBloodPressure}
          bloodPressureHint={bloodPressureHint}
          onOpenSettings={() => {
            setShowSettings(true);
            setShowQuickActions(false);
          }}
        />
      )}
    </>
  );
}
