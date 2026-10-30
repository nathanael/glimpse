// The easy-mode landing screen: four stat tiles, two of them photographs (Supplements, Tracking),
// over a grid of the quick actions, all within reach of the thumb. Tapping a photograph morphs it into a panel that
// fills Home: the photo grows out of its tile, the title flies up into a header and that kind of
// logging's options spring up from the bottom. Purely presentational: every button calls a
// handler App already owns, and nothing here writes to a store.
//
// The morph is imperative Web Animations (see motion.js for the springs): React only mounts the
// panel; the layout effect measures where the tile was and plays the panel out of it. Closing
// plays it back into the tile before the panel unmounts. Drag the open panel down to dismiss.
//
// The photographs keep the .hm-card class and their background-image: shatter.js cuts them into
// tiles for the Advanced-mode transition.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { solar } from './solarIcons';
import { formatMinutes, sparkPath } from '../utils/homeStats';
import { springs, reducedMotion } from './motion';
import symptomsArt from '../assets/home/symptoms.jpg';
import supplementsArt from '../assets/home/supplements.jpg';
import './home.css';

// iOS only raises the keyboard for a focus() made inside the tap itself, and the note sheet's
// textarea (or a new row's name field) mounts a render later. Focusing a throwaway input in the
// tap raises it; the real field then takes the focus over and the keyboard stays up.
function primeKeyboard() {
  const el = document.createElement('input');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0';
  document.body.appendChild(el);
  el.focus();
  setTimeout(() => el.remove(), 1000);
}

// A trend line across the bottom of a tile; nothing until there are two points.
function Spark({ values }) {
  const d = sparkPath(values, 120, 24);
  return d ? <svg className="hm-spark" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><path d={d} /></svg> : null;
}

// '7:52 AM' today, 'Yesterday' or 'Oct 28'
function bpWhen(iso) {
  const at = new Date(iso), now = new Date();
  if (Number.isNaN(at.getTime())) return '';
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(at)) / 864e5);
  return diff === 0 ? at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : diff === 1 ? 'Yesterday' : at.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const relTo = (el, base) => {
  const r = el.getBoundingClientRect(), b = base.getBoundingClientRect();
  return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
};
const boxFrames = (a, b) => [
  { left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px', borderRadius: a.rad },
  { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', borderRadius: b.rad },
];

export default function Home({
  summary,            // { symptoms, supplements }: each a string, or null when nothing is logged yet
  stats,              // { supplements: {taken, due}, health, sleep, bp } from utils/homeStats.js
  onSleep,
  onBloodPressurePage,
  // Supplements panel
  onSimpleChecklist,
  onMatchYesterday,
  onAddSupplement,
  onProtocolDetail,
  // Tracking panel
  onRapidEntry,
  onTalkMode,
  onAddSymptom,
  onSymptomList,
  // Grid
  onNote,
  onBloodPressure,
  onAdvanced,         // (event): the button is the origin of the shatter
  onMore,
}) {
  const [open, setOpen] = useState(null);   // 'supplements' | 'tracking' | null
  const rootRef = useRef(null);
  const cardRefs = useRef({});
  const xpRef = useRef(null);
  const busy = useRef(false);

  // Each panel: the ways of logging as frosted bars, then the door into the full tab as plain
  // text under them.
  const { supplements: supp, health, sleep, bp } = stats;
  const left = supp.due - supp.taken;
  const change = health.change == null || health.change === 0 ? '' : ` · ${health.change > 0 ? '↑' : '↓'} ${Math.abs(health.change)} this week`;
  const cards = [
    {
      id: 'supplements', title: 'Supplements', art: supplementsArt, line: summary.supplements, empty: 'None taken yet',
      stat: supp.due ? (
        <span className="hm-num">
          <b>{supp.taken}<em> / {supp.due}</em></b>
          <span className="hm-bar" aria-hidden="true"><i style={{ width: `${(supp.taken / supp.due) * 100}%` }} /></span>
          <small className={left ? '' : 'done'}>{left ? `${left} left today` : 'All taken'}</small>
        </span>
      ) : <span className="hm-num"><b className="none">–</b><small>Nothing due today</small></span>,
      options: [
        { icon: 'protocol', label: 'Simple checklist', onClick: onSimpleChecklist },
        { icon: 'yesterday', label: 'Match yesterday', onClick: onMatchYesterday },
        { icon: 'add', label: 'Add supplement', onClick: () => { primeKeyboard(); onAddSupplement(); } },
        { icon: 'more', label: 'Full protocol', onClick: onProtocolDetail, deep: true },
      ],
    },
    {
      id: 'tracking', title: 'Tracking', art: symptomsArt, line: summary.symptoms, empty: 'Not checked in yet',
      stat: (
        <span className="hm-num">
          <b className={health.today == null ? 'none' : ''}>{health.today ?? '–'}</b>
          <Spark values={health.points} />
          <small>{health.today == null ? 'Not checked in yet' : `Health score${change}`}</small>
        </span>
      ),
      options: [
        { icon: 'bolt', label: 'Rapid entry', onClick: onRapidEntry },
        { icon: 'mic', label: 'Talk me through it', onClick: onTalkMode },
        { icon: 'add', label: 'Add symptom', onClick: () => { primeKeyboard(); onAddSymptom(); } },
        { icon: 'symptoms', label: 'Full list', onClick: onSymptomList, deep: true },
      ],
    },
  ];
  const openCard = cards.find((c) => c.id === open);

  const actions = [
    { id: 'checkin', icon: 'bolt', label: 'Check-in', tone: 'a', onClick: onRapidEntry },
    { id: 'pills', icon: 'protocol', label: 'Pills', tone: 'b', onClick: onSimpleChecklist },
    { id: 'bp', icon: 'heart', label: 'BP', tone: 'c', onClick: onBloodPressure },
    { id: 'note', icon: 'note', label: "Day's note", onClick: () => { primeKeyboard(); onNote(); } },
    { id: 'advanced', icon: 'transfer', label: 'Advanced', onClick: onAdvanced },
    { id: 'more', icon: 'more', label: 'More', onClick: onMore },
  ];

  // Arriving on Home the photographs settle in and the actions spring up one after another.
  // Coming back from Advanced the shatter holds Home invisible (html.fx-hold) until its tiles
  // land on the photographs; the grid then fades up gently instead of appearing all at once.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion()) return;
    const html = document.documentElement;
    const acts = [...el.querySelectorAll('.hm-act')];
    if (html.classList.contains('fx-hold')) {
      acts.forEach((b) => { b.style.opacity = '0'; });
      const reveal = () => acts.forEach((b, i) => {
        b.style.opacity = '';
        b.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: 80 + i * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      });
      const mo = new MutationObserver(() => {
        if (!html.classList.contains('fx-hold')) { mo.disconnect(); reveal(); }
      });
      mo.observe(html, { attributes: true, attributeFilter: ['class'] });
      return () => mo.disconnect();
    }
    const cs = springs.card(), bs = springs.btn();
    el.querySelectorAll('.hm-card, .hm-stat').forEach((c, i) => c.animate(
      [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }],
      { duration: cs.ms, delay: i * 60, easing: cs.easing, fill: 'backwards' }));
    acts.forEach((b, i) => b.animate(
      [{ opacity: 0, transform: 'translateY(60px) scale(.86)' }, { opacity: 1, transform: 'none' }],
      { duration: bs.ms, delay: 120 + i * 45, easing: bs.easing, fill: 'backwards' }));
  }, []);

  const show = (id) => {
    if (busy.current || open) return;
    busy.current = true;
    setOpen(id);
  };

  // Where the panel's pieces sit when folded back into the tile, relative to the panel.
  const tileGeometry = (xp) => {
    const card = cardRefs.current[open];
    return { box: { ...relTo(card, xp), rad: '22px' }, title: relTo(card.querySelector('.hm-title'), xp) };
  };

  // Open: play the panel out of its tile.
  useLayoutEffect(() => {
    const xp = xpRef.current;
    if (!open || !xp) return;
    const q = (s) => xp.querySelector(s);
    if (reducedMotion()) {
      xp.animate([{ opacity: 0 }, { opacity: 1 }], 200).finished.then(() => { busy.current = false; }, () => {});
      return;
    }
    const { box, title } = tileGeometry(xp);
    const full = { x: 0, y: 0, w: xp.clientWidth, h: xp.clientHeight, rad: '22px' };
    const h2 = q('h2'), lr = relTo(h2, xp);
    const sp = springs.card(), bs = springs.btn();
    xp.style.pointerEvents = 'none';
    const main = q('.hm-xp-bg').animate(boxFrames(box, full), { duration: sp.ms, easing: sp.easing });
    q('.g1').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
    q('.g2').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
    h2.animate([{ transform: `translate(${title.x - lr.x}px,${title.y - lr.y}px) scale(${title.h / lr.h})` }, { transform: 'none' }], { duration: sp.ms, easing: sp.easing });
    q('.hm-xp-head small')?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 160, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    q('.hm-xp-x').animate([{ opacity: 0, transform: 'scale(.5) rotate(-90deg)' }, { opacity: 1, transform: 'none' }], { duration: bs.ms, delay: 200, easing: bs.easing, fill: 'backwards' });
    xp.querySelectorAll('.hm-opts button').forEach((b, i) => b.animate(
      [{ opacity: 0, transform: 'translateY(90px) scale(.86)' }, { opacity: 1, transform: 'none' }],
      { duration: bs.ms, delay: 150 + i * 70, easing: bs.easing, fill: 'backwards' }));
    // Deaf to taps until it has arrived, so the finger lifting from the opening tap can't land
    // on an option sliding in under it.
    main.finished.then(() => { busy.current = false; xp.style.pointerEvents = ''; }, () => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close: play the panel back into its tile from wherever it is now (it may be mid-drag).
  const close = () => {
    const xp = xpRef.current;
    if (busy.current || !open || !xp) return;
    busy.current = true;
    const done = () => { busy.current = false; setOpen(null); };
    if (reducedMotion()) { xp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(done, done); return; }
    const q = (s) => xp.querySelector(s);
    const bg = q('.hm-xp-bg'), h2 = q('h2');
    const cb = relTo(bg, xp), ch = relTo(h2, xp), curRad = getComputedStyle(bg).borderTopLeftRadius;
    xp.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    xp.style.transform = ''; bg.style.borderRadius = '';
    xp.parentElement.classList.remove('recede');
    const { box, title } = tileGeometry(xp), lh = relTo(h2, xp);
    const sp = springs.close(), o = { duration: sp.ms, easing: sp.easing, fill: 'forwards' };
    const main = bg.animate(boxFrames({ ...cb, rad: curRad }, box), o);
    h2.animate([
      { transform: `translate(${ch.x - lh.x}px,${ch.y - lh.y}px) scale(${ch.h / lh.h})` },
      { transform: `translate(${title.x - lh.x}px,${title.y - lh.y}px) scale(${title.h / lh.h})` },
    ], o);
    q('.g1').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
    q('.g2').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    xp.querySelectorAll('.hm-xp-head small, .hm-xp-x, .hm-opts button').forEach((el, i) => el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(40px) scale(.94)' }],
      { duration: 180, delay: i * 25, easing: 'ease-in', fill: 'forwards' }));
    main.finished.then(done, done);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A tap anywhere on the open panel except its buttons closes it, like the X.
  const onPanelClick = (e) => {
    if (dragged.current || e.target.closest('button')) return;
    close();
  };

  // Drag down to dismiss: the panel follows the finger, shrinking; let go past 90px to close,
  // short of that it springs back.
  const drag = useRef(null);
  const dragged = useRef(false);   // the last press moved, so its click is not a tap to close
  const onPointerDown = (e) => {
    if (busy.current || e.target.closest('button')) return;
    drag.current = { y0: e.clientY, dy: 0 };
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const xp = xpRef.current, dy = Math.max(0, e.clientY - drag.current.y0), p = Math.min(dy / 400, 1);
    drag.current.dy = dy;
    if (dy > 8) dragged.current = true;
    xp.style.transform = `translateY(${dy * 0.4}px) scale(${1 - p * 0.2})`;
    xp.querySelector('.hm-xp-bg').style.borderRadius = `${22 + p * 30}px`;
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    if (dy > 90) return close();
    const xp = xpRef.current, from = xp.style.transform, sp = springs.card();
    xp.style.transform = '';
    xp.querySelector('.hm-xp-bg').style.borderRadius = '';
    if (from) xp.animate([{ transform: from }, { transform: 'none' }], { duration: sp.ms, easing: sp.easing });
  };

  return (
    <div className={`hm${open ? ' recede' : ''}`} ref={rootRef}>
      <div className="hm-tiles">
        {cards.map((card) => (
          <button
            key={card.id}
            ref={(el) => { cardRefs.current[card.id] = el; }}
            type="button"
            className={`hm-card${open === card.id ? ' hide' : ''}`}
            style={{ backgroundImage: `url(${card.art})` }}
            aria-expanded={open === card.id}
            aria-label={`${card.title}: ${card.line || card.empty}. Show options`}
            onClick={() => show(card.id)}
          >
            <span className="hm-face">
              <span className="hm-title">{card.title}</span>
              {card.stat}
            </span>
          </button>
        ))}
        <button type="button" className="hm-stat sleep" onClick={onSleep}>
          <span className="hm-face">
            <span className="hm-title">Sleep</span>
            {sleep ? (
              <span className="hm-num">
                <b>{formatMinutes(sleep.minutes)}</b>
                <span className="hm-stages" aria-hidden="true">
                  <i className="deep" style={{ flex: sleep.stages.deep }} />
                  <i className="light" style={{ flex: sleep.stages.light }} />
                  <i className="rem" style={{ flex: sleep.stages.rem }} />
                </span>
                <small>{sleep.score != null ? `Garmin score ${sleep.score}` : 'Last night'}</small>
              </span>
            ) : (
              <span className="hm-num"><b className="none">–</b><small>No sleep data yet</small></span>
            )}
          </span>
        </button>
        <button type="button" className="hm-stat pressure" onClick={onBloodPressurePage}>
          <span className="hm-face">
            <span className="hm-title">Blood pressure</span>
            {bp ? (
              <span className="hm-num">
                <b>{bp.sys}<em>/{bp.dia}</em></b>
                <Spark values={bp.points} />
                <small><i className={`hm-dot ${bp.category.id}`} />{bp.category.label} · {bpWhen(bp.time)}</small>
              </span>
            ) : (
              <span className="hm-num"><b className="none">–</b><small>No readings yet</small></span>
            )}
          </span>
        </button>
      </div>

      <div className="hm-grid">
        {actions.map((a) => (
          <button key={a.id} type="button" className={`hm-act${a.tone ? ` t-${a.tone}` : ''}`} onClick={a.onClick}>
            <svg viewBox="0 0 24 24">{solar[a.icon]}</svg>
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      {openCard && (
        <div
          ref={xpRef}
          className="hm-xp"
          role="dialog"
          aria-label={openCard.title}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onPanelClick}
        >
          <div className="hm-xp-bg" style={{ backgroundImage: `url(${openCard.art})` }}>
            <i className="g1" /><i className="g2" />
          </div>
          <button type="button" className="hm-xp-x" aria-label={`${openCard.title}: hide options`} onClick={close}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className="hm-xp-head">
            <h2>{openCard.title}</h2>
            <small>{openCard.line || openCard.empty}</small>
          </div>
          <div className="hm-opts">
            {openCard.options.map((opt) => (
              <button type="button" key={opt.label} className={opt.deep ? 'deep' : ''} onClick={opt.onClick}>
                <svg viewBox="0 0 24 24">{solar[opt.icon]}</svg>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
