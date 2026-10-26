// The one way out of every overlay: the Home card panel's frosted round X, top right, bouncing in
// on the same spring (Home.jsx animates its own copy as part of the card morph). Overlays rise in
// on the card spring and can be dragged down by their header to dismiss, like the Home panel.

import { useLayoutEffect, useRef } from 'react';
import { springs, reducedMotion } from './motion';
import './overlay.css';

export function CloseButton({ onClick, label = 'Close', delay = 200 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.animate || reducedMotion()) return;
    const bs = springs.btn();
    el.animate([{ opacity: 0, transform: 'scale(.5) rotate(-90deg)' }, { opacity: 1, transform: 'none' }], { duration: bs.ms, delay, easing: bs.easing, fill: 'backwards' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" ref={ref} className="ui-x" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  );
}

// Play the overlay up from a little below on mount: the move springs, the fade is quick.
export function useRiseIn(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.animate) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    if (reducedMotion()) return;
    const sp = springs.card();
    el.animate([{ transform: 'translateY(56px) scale(.97)' }, { transform: 'none' }], { duration: sp.ms, easing: sp.easing });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// Spread onto an overlay's header: the overlay follows the finger down; let go past 90px to close,
// short of that it springs back. Presses that start on a control are left alone.
export function useDragDismiss(ref, onClose) {
  const drag = useRef(null);
  const end = () => {
    const d = drag.current, el = ref.current;
    drag.current = null;
    if (!d || !el || !d.dy) return;
    el.style.transform = '';
    if (d.dy > 90) {
      el.animate([{ transform: `translateY(${d.dy}px)`, opacity: 1 }, { transform: `translateY(${window.innerHeight}px)`, opacity: 0.4 }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(onClose, onClose);
    } else {
      const sp = springs.close();
      el.animate([{ transform: `translateY(${d.dy}px)` }, { transform: 'none' }], { duration: sp.ms, easing: sp.easing });
    }
  };
  return {
    onPointerDown: (e) => {
      if (e.button > 0 || e.target.closest('button, input, textarea, select, a')) return;
      drag.current = { y0: e.clientY, dy: 0 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d || !ref.current) return;
      d.dy = Math.max(0, e.clientY - d.y0);
      ref.current.style.transform = `translateY(${d.dy}px)`;
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}
