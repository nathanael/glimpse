import { useRef, useEffect, useState } from 'react';
import { getDateKey, noteText } from '../utils/helpers';
import { solar } from './solarIcons';
import './noteModal.css';
import { CloseButton, useDragDismiss } from './overlay';

// Write a note as a { text } record, or delete the key when the text is empty.
// The sync engine stamps `_t`; the app never sets it. Deleting an empty note
// propagates via the sync delete path (matches prior empty-note behavior).
function writeNote(setDailyNotes, dateKey, value) {
  const trimmed = (value || '').trim();
  setDailyNotes(prev => {
    if (!trimmed) {
      if (!(dateKey in prev)) return prev;
      const { [dateKey]: _omit, ...rest } = prev;
      return rest;
    }
    return { ...prev, [dateKey]: { text: trimmed } };
  });
}

const AI_KIND_LABELS = {
  observation: 'AI observation',
  treatment_response: 'AI · treatment response',
  hypothesis: 'AI hypothesis',
  patient_report: 'You said',
};

// Notes the Glimpse Health MCP saved for this day, oldest first. Read-only here.
function aiNotesFor(aiNotes, dateKey) {
  if (!aiNotes || typeof aiNotes !== 'object') return [];
  return Object.entries(aiNotes)
    .filter(([key, n]) => key.startsWith(`${dateKey}-ai-`) && n && typeof n.text === 'string')
    .map(([key, n]) => ({
      key, text: n.text, kind: n.kind, origin: n.origin,
      time: n.createdAt ? new Date(n.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '',
      at: n.createdAt || '',
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

// Notes: a side panel on desktop, a bottom sheet on mobile
export default function NoteModal({
  selectedDate,
  dailyNotes,
  setDailyNotes,
  aiNotes,
  onClose,
  isDesktop,
  onVoice, // mobile, today only: switch to a voice note
}) {
  const textareaRef = useRef(null);
  const scrimRef = useRef(null);
  const panelRef = useRef(null);
  const dragDismiss = useDragDismiss(panelRef, onClose);
  const dateKey = getDateKey(selectedDate);
  const saved = noteText(dailyNotes[dateKey]);

  // Local state for immediate input response
  const [localNote, setLocalNote] = useState(saved);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  // Mobile: iOS lays the keyboard over the page instead of shrinking it, and may pan the page to
  // show the caret. Pin the scrim to the visible part of the screen (the visual viewport) so the
  // sheet always fills what can be seen and its footer, with the Speak button, rests on the keys.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = scrimRef.current;
    if (isDesktop || !vv || !el) return;
    const fit = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = 'auto';
      // Keys up: the sheet ends at them, so the home-indicator padding would only leave a gap
      el.classList.toggle('kb', vv.height < window.screen.height * 0.75);
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, [isDesktop]);

  // Track the latest note value for saving on unmount
  const localNoteRef = useRef(localNote);
  localNoteRef.current = localNote;

  // Debounced sync to parent state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localNote.trim() !== noteText(dailyNotes[dateKey]).trim()) {
        writeNote(setDailyNotes, dateKey, localNote);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localNote, dateKey, dailyNotes, setDailyNotes]);

  // Save immediately on unmount (in case debounce hasn't fired yet)
  useEffect(() => {
    return () => {
      writeNote(setDailyNotes, dateKey, localNoteRef.current);
    };
  }, [dateKey, setDailyNotes]);

  const isToday = dateKey === getDateKey(new Date());
  const longDate = selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const pending = localNote.trim() !== saved.trim();
  const words = localNote.trim() ? localNote.trim().split(/\s+/).length : 0;
  const notesFromChat = aiNotesFor(aiNotes, dateKey);

  return (
    <div ref={scrimRef} className={`nm-scrim ${isDesktop ? 'desk' : 'mob'}`} onClick={onClose}>
      <section ref={panelRef} className="nm-panel" role="dialog" aria-modal="true" aria-label={`Notes for ${longDate}`} onClick={(e) => e.stopPropagation()}>
        {!isDesktop && <div className="nm-grabber" aria-hidden="true" />}
        <header className={`nm-head${isDesktop ? '' : ' ui-drag'}`} {...(isDesktop ? {} : dragDismiss)}>
          <div>
            <div className="nm-eyebrow">Notes</div>
            <h2 className="nm-title">{isToday ? 'Today' : longDate}</h2>
            {isToday && <div className="nm-sub">{longDate}</div>}
          </div>
          <CloseButton label="Close notes" onClick={onClose} />
        </header>
        <textarea
          ref={textareaRef}
          className="nm-text"
          value={localNote}
          onChange={(e) => setLocalNote(e.target.value)}
          placeholder="How was the day? Food, sleep, stress, activity, anything that might matter…"
          enterKeyHint="enter"
        />
        {notesFromChat.length > 0 && (
          <div className="nm-ai" aria-label="Notes from ChatGPT">
            {notesFromChat.map((n) => (
              <article key={n.key} className="nm-ai-note">
                <div className="nm-ai-label">
                  <span className={n.origin === 'patient_reported' ? 'you' : 'ai'}>{AI_KIND_LABELS[n.kind] || 'AI note'}</span>
                  <span>via ChatGPT{n.time ? ` · ${n.time}` : ''}</span>
                </div>
                <p>{n.text}</p>
              </article>
            ))}
          </div>
        )}
        <footer className="nm-foot">
          <span className={`nm-status ${pending ? 'pending' : ''}`}>
            <i />{pending ? 'Saving…' : localNote.trim() ? 'Saved' : 'Nothing written yet'}
          </span>
          <span>
            {words ? `${words} word${words === 1 ? '' : 's'}` : ''}{isDesktop && <kbd>Esc</kbd>}
            {onVoice && isToday && (
              // preventDefault on pointerdown keeps the textarea focused, so the keyboard doesn't drop first
              <button className="nm-voice" aria-label="Speak instead" onPointerDown={(e) => e.preventDefault()} onClick={onVoice}>
                <svg viewBox="0 0 24 24">{solar.mic}</svg>Speak
              </button>
            )}
          </span>
        </footer>
      </section>
    </div>
  );
}
