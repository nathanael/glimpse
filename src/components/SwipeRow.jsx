// A list row that slides left to show its actions (Edit, Hide), like iOS Mail. Mobile only:
// with no actions, or `disabled`, it renders the row untouched.
//
// The row follows the finger once the drag is clearly sideways; a vertical drag is left to the
// page so the list still scrolls. Let go past half the actions' width and it stays open. A tap
// on an open row closes it without reaching the row, and opening one row closes any other.

import { useEffect, useRef, useState } from 'react';

const ACTION_W = 76;
let closeOpen = null;   // the one open row's close(), if any

export default function SwipeRow({ actions, disabled, children }) {
  const fg = useRef(null);
  const drag = useRef(null);
  const swallow = useRef(false);
  const [open, setOpen] = useState(false);
  const width = (actions?.length || 0) * ACTION_W;

  const slide = (x, animate) => {
    const el = fg.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none';
    el.style.transform = x ? `translateX(${x}px)` : '';
    // The actions only exist while the row is off its rest position, so no sliver shows at rest
    const box = el.parentElement;
    clearTimeout(box._hide);
    if (x) box.dataset.show = '';
    else if (animate) box._hide = setTimeout(() => delete box.dataset.show, 300);
    else delete box.dataset.show;
  };
  const close = () => { slide(0, true); setOpen(false); if (closeOpen === close) closeOpen = null; };

  useEffect(() => () => { if (closeOpen === close) closeOpen = null; });   // eslint-disable-line react-hooks/exhaustive-deps

  if (disabled || !width) return children;

  const onPointerDown = (e) => {
    if (e.button > 0) return;
    drag.current = { x0: e.clientX, y0: e.clientY, base: open ? -width : 0, axis: null, x: 0 };
    swallow.current = false;
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') {
        if (closeOpen && closeOpen !== close) closeOpen();
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    }
    if (d.axis !== 'x') return;
    swallow.current = true;
    d.x = Math.max(-width - 24, Math.min(0, d.base + dx));
    slide(d.x, false);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    if (d.x < -width / 2) {
      slide(-width, true);
      setOpen(true);
      closeOpen = close;
    } else close();
  };
  // A tap on an open row, or the click ending a drag, never reaches the row underneath
  const onClickCapture = (e) => {
    if (swallow.current || open) {
      e.stopPropagation();
      e.preventDefault();
      if (!swallow.current) close();
      swallow.current = false;
    }
  };

  return (
    <div className={`sw${open ? ' open' : ''}`}>
      <div className="sw-acts" style={{ width }} aria-hidden={!open || undefined}>
        {actions.map((a) => (
          <button key={a.label} type="button" className={`sw-act ${a.tone || ''}`} tabIndex={open ? 0 : -1}
            onClick={() => { close(); a.onClick(); }}>
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <div
        ref={fg}
        className="sw-fg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}

export const swipeIcons = {
  edit: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>,
  hide: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 21 12a13 13 0 0 1-2.5 3.3M6.6 6.6A13 13 0 0 0 3 12s3 7 9 7a9 9 0 0 0 5.4-1.6" /></svg>,
};
