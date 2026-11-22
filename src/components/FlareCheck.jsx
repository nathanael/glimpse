import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './flareCheck.css';

// A pop-up on Tracking when several symptoms are above normal for the day. One question, then one
// optional line of free text. "Not now" (or Escape, or a click outside) puts it off until the app
// is next opened.
export default function FlareCheck({ up, isToday, onAnswer, onDismiss }) {
  const [step, setStep] = useState('ask'); // ask | why
  const [causes, setCauses] = useState('');
  const list = up.map((s) => s.name);
  const shown = list.length > 4 ? `${list.slice(0, 4).join(', ')} and ${list.length - 4} more` : list.join(', ');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDismiss]);

  return createPortal(
    <div className="fc-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="fc" role="dialog" aria-modal="true" aria-label="Flare check">
        {step === 'ask' ? (
          <>
            <h3>Would you call this a flare?</h3>
            <p>{up.length} symptoms are above your normal {isToday ? 'today' : 'on this day'}: {shown}.</p>
            <div className="fc-acts">
              <button className="fc-btn ghost" onClick={onDismiss}>Not now</button>
              <button className="fc-btn" onClick={() => onAnswer({ flare: false })}>No</button>
              <button className="fc-btn primary" autoFocus onClick={() => setStep('why')}>Yes</button>
            </div>
          </>
        ) : (
          <>
            <h3>What do you think contributed?</h3>
            <textarea autoFocus rows={3} value={causes} placeholder="Food, sleep, stress, a new supplement, something you stopped…" onChange={(e) => setCauses(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAnswer({ flare: true, causes }); if (e.key !== 'Escape') e.stopPropagation(); }} />
            <div className="fc-acts">
              <button className="fc-btn ghost" onClick={() => onAnswer({ flare: true, causes: '' })}>Skip</button>
              <button className="fc-btn primary" onClick={() => onAnswer({ flare: true, causes })}>Save</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
