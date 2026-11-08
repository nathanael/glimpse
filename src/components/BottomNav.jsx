import './mobileNav.css';
import QuickActionsMenu from './QuickActionsMenu';
import DayBar from './DayBar';

// Mobile dock on the Advanced lists and Progress: the list's actions, then the bar every screen
// shares (Home · days · switch). The switch drops into that list's simple screen.
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
  onCheckIn,          // the simple check-in, from the Tracking list's switch
  onSimpleChecklist,  // the Pills checklist, from the supplements list's switch
  onHome,
  onSelectDate,
  dayStatus,          // (date) => 'full' | 'part' | '' for the list on screen
  onClear,
  onEditProtocol,
  onLogMeal,
  onBloodPressure,
  bloodPressureHint,
  actions,        // { buttons: [{ label, onClick, primary }], onAdd, addLabel }: the list's bar above the tabs
}) {
  const activeTab = showInsights ? 'insights' : appMode === 'home' ? 'home' : appMode === 'symptoms' ? 'symptoms' : 'stack';
  // Home has no dock; leaving it the dock rises into place, coming back it drops away.
  const away = appMode === 'home' && !showInsights;
  const toSimple = activeTab === 'symptoms' ? onCheckIn : activeTab === 'stack' ? onSimpleChecklist : undefined;

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
          <DayBar
            selectedDate={activeTab === 'insights' ? undefined : selectedDate}
            onSelect={onSelectDate}
            status={dayStatus}
            onHome={onHome}
            onSwitch={toSimple && (() => { setShowQuickActions(false); toSimple(); })}
            switchLabel={activeTab === 'symptoms' ? 'Simple check-in' : 'Simple pills'}
          />
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
