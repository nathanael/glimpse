import { useState } from 'react';
import './flareCheck.css';

// Asked on Tracking when several symptoms are above normal for the day. One question, then one
// optional line of free text. "Not now" hides it until the app is next opened.
export default function FlareCheck({ up, isToday, onAnswer, onDismiss }) {
  const [step, setStep] = useState('ask'); // ask | why
  const [causes, setCauses] = useState('');
  const list = up.map((s) => s.name);
  const shown = list.length > 4 ? `${list.slice(0, 4).join(', ')} and ${list.length - 4} more` : list.join(', ');
  return (
    <div className="fc" role="group" aria-label="Flare check">
      {step === 'ask' ? (
        <>
          <div className="fc-text">
            <b>{up.length} symptoms are above your normal {isToday ? 'today' : 'on this day'}.</b> Would you call this a flare?
            <small>{shown}</small>
          </div>
          <div className="fc-acts">
            <button className="dn-btn primary" onClick={() => setStep('why')}>Yes</button>
            <button className="dn-btn" onClick={() => onAnswer({ flare: false })}>No</button>
            <button className="dn-btn ghost" onClick={onDismiss}>Not now</button>
          </div>
        </>
      ) : (
        <>
          <div className="fc-text">
            <b>What do you think contributed?</b>
            <textarea autoFocus rows={2} value={causes} placeholder="Food, sleep, stress, a new supplement, something you stopped…" onChange={(e) => setCauses(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAnswer({ flare: true, causes }); e.stopPropagation(); }} />
          </div>
          <div className="fc-acts">
            <button className="dn-btn primary" onClick={() => onAnswer({ flare: true, causes })}>Save</button>
            <button className="dn-btn ghost" onClick={() => onAnswer({ flare: true, causes: '' })}>Skip</button>
          </div>
        </>
      )}
    </div>
  );
}
