// The easy-mode landing screen: two photographs, Supplements and Tracking, each a door into its
// full tab, and under them a grid of the quick actions, within reach of the thumb. Purely
// presentational: every button calls a handler App already owns, and nothing here writes to a
// store. The grid springs up into place when Home mounts (springs from motion.js).
//
// The photographs keep the .hm-card class and their background-image: shatter.js cuts them into
// tiles for the Advanced-mode transition.

import { useLayoutEffect, useRef } from 'react';
import { solar } from './solarIcons';
import { springs, reducedMotion } from './motion';
import symptomsArt from '../assets/home/symptoms.jpg';
import supplementsArt from '../assets/home/supplements.jpg';
import './home.css';

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

export default function Home({
  summary,            // { symptoms, supplements }: each a string, or null when nothing is logged yet
  onSupplements,
  onTracking,
  onCheckIn,
  onPills,
  onNote,
  onMeal,
  onAdvanced,         // (event): the button is the origin of the shatter
  onMore,
}) {
  const rootRef = useRef(null);

  const doors = [
    { id: 'supplements', title: 'Supplements', art: supplementsArt, line: summary.supplements || 'None taken yet', done: !!summary.supplements, onClick: onSupplements },
    { id: 'tracking', title: 'Tracking', art: symptomsArt, line: summary.symptoms || 'Not checked in yet', done: !!summary.symptoms, onClick: onTracking },
  ];

  const actions = [
    { id: 'checkin', icon: 'bolt', label: 'Check-in', tone: 'a', onClick: onCheckIn },
    { id: 'pills', icon: 'protocol', label: 'Pills', tone: 'b', onClick: onPills },
    { id: 'note', icon: 'note', label: "Day's note", tone: 'c', onClick: () => { primeKeyboard(); onNote(); } },
    { id: 'meal', icon: 'camera', label: 'Meal', onClick: onMeal },
    { id: 'advanced', icon: 'transfer', label: 'Advanced', onClick: onAdvanced },
    { id: 'more', icon: 'more', label: 'More', onClick: onMore },
  ];

  // On arrival the photographs settle in and the actions spring up one after another, the
  // same bounce the old card panels had.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion()) return;
    const cs = springs.card(), bs = springs.btn();
    el.querySelectorAll('.hm-card').forEach((c, i) => c.animate(
      [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }],
      { duration: cs.ms, delay: i * 60, easing: cs.easing, fill: 'backwards' }));
    el.querySelectorAll('.hm-act').forEach((b, i) => b.animate(
      [{ opacity: 0, transform: 'translateY(60px) scale(.86)' }, { opacity: 1, transform: 'none' }],
      { duration: bs.ms, delay: 120 + i * 45, easing: bs.easing, fill: 'backwards' }));
  }, []);

  return (
    <div className="hm" ref={rootRef}>
      {doors.map((d) => (
        <button
          key={d.id}
          type="button"
          className="hm-card"
          style={{ backgroundImage: `url(${d.art})` }}
          aria-label={`${d.title}: ${d.line}`}
          onClick={d.onClick}
        >
          <span className="hm-face">
            <span className="hm-title">{d.title}</span>
            <small className={d.done ? 'done' : ''}>{d.line}</small>
          </span>
        </button>
      ))}

      <div className="hm-grid">
        {actions.map((a) => (
          <button key={a.id} type="button" className="hm-act" onClick={a.onClick}>
            <i className={a.tone ? `t-${a.tone}` : ''}><svg viewBox="0 0 24 24">{solar[a.icon]}</svg></i>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
