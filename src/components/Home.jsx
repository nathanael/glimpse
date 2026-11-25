// The easy-mode landing screen: three sections stacked, Health tracking and Protocol (photographs)
// and Sleep,
// over a grid of the quick actions, all within reach of the thumb. Tapping the photograph morphs it into a panel that
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
import { springs, reducedMotion } from './motion';
import { primeKeyboard } from '../utils/primeKeyboard';
import { FACTORS_LABEL } from '../utils/labels';
import symptomsArt from '../assets/home/symptoms.jpg';
import supplementsArt from '../assets/home/supplements.jpg';
import './home.css';

// Garmin dates a night by the morning you woke up, so today's date is last night.
function sleepWhen(date) {
  const [y, m, d] = date.split('-').map(Number);
  const night = new Date(y, m - 1, d), now = new Date();
  const age = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - night) / 864e5);
  return { label: age <= 0 ? 'Last night' : night.toLocaleDateString([], { month: 'short', day: 'numeric' }), stale: age >= 2 };
}

const relTo = (el, base) => {
  const r = el.getBoundingClientRect(), b = base.getBoundingClientRect();
  return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
};
const boxFrames = (a, b) => [
  { left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px', borderRadius: a.rad },
  { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', borderRadius: b.rad },
];

const Option = ({ opt }) => (
  <button type="button" className={opt.deep ? 'deep' : ''} onClick={opt.onClick}>
    <svg viewBox="0 0 24 24">{solar[opt.icon]}</svg>
    <span>{opt.label}</span>
  </button>
);

export default function Home({
  summary,            // { symptoms }: a string, or null when nothing is logged yet
  stats,              // { health, sleep } from utils/homeStats.js
  onSleep,
  // Health tracking panel
  onRapidEntry,
  onTalkMode,
  onProgress,
  onSymptomList,
  // Protocol panel
  onPills,
  onFactors,
  onAddAny,
  onSupplementList,
  // Grid
  onSimpleChecklist,
  // Grid
  onNote,
  onBloodPressure,
  onMore,
}) {
  const [open, setOpen] = useState(null);   // 'tracking' | 'protocol' | null
  const rootRef = useRef(null);
  const cardRefs = useRef({});
  const xpRef = useRef(null);
  const busy = useRef(false);

  // Each panel: the ways of logging as frosted bars, then the door into the full tab as plain
  // text under them.
  const { health, sleep, sleepError, supplements, factors } = stats;
  // Each tile is its title and one number, nothing else: the latest health score, the share of
  // today's supplements taken, the latest sleep score.
  const pct = supplements.due ? Math.round((supplements.taken / supplements.due) * 100) : null;
  const cards = [
    {
      id: 'tracking', title: 'Health tracking', art: symptomsArt, line: summary.symptoms, empty: 'Not checked in yet',
      stat: (
        <span className="hm-num">
          <b className={health.today == null ? 'none' : ''}>{health.today == null ? '–' : <>{health.today}<i className="hm-pc">%</i></>}</b>
        </span>
      ),
      options: [
        { icon: 'bolt', label: 'Rapid entry', onClick: onRapidEntry },
        { icon: 'mic', label: 'Talk me through it', onClick: onTalkMode },
        { icon: 'progress', label: 'Progress', onClick: onProgress },
        { icon: 'symptoms', label: 'Full list', onClick: onSymptomList, deep: true },
      ],
    },
    {
      // What you take and do: today's pills and the habits.
      id: 'protocol', title: 'Protocol', art: supplementsArt,
      line: supplements.due ? `${supplements.taken} of ${supplements.due} supplements taken${factors.total ? ` · ${FACTORS_LABEL.toLowerCase()} ${factors.logged} of ${factors.total}` : ''}` : null, empty: 'Nothing due today',
      stat: (
        <span className="hm-num">
          <b className={pct == null ? 'none' : ''}>{pct == null ? '–' : <>{pct}<i className="hm-pc">%</i></>}</b>
        </span>
      ),
      options: [
        { icon: 'protocol', label: 'Pills', onClick: onPills },
        { icon: 'list', label: FACTORS_LABEL, onClick: onFactors },
        { icon: 'protocol', label: 'Supplements', onClick: onSupplementList, deep: true, pair: true },
        { icon: 'symptoms', label: 'Symptoms', onClick: onSymptomList, deep: true, pair: true },
      ],
    },
  ];
  const openCard = cards.find((c) => c.id === open);

  const actions = [
    { id: 'checkin', icon: 'bolt', label: 'Check-in', tone: 'a', onClick: onRapidEntry },
    { id: 'pills', icon: 'protocol', label: 'Pills', tone: 'b', onClick: onSimpleChecklist },
    { id: 'bp', icon: 'heart', label: 'BP', tone: 'c', onClick: onBloodPressure },
    { id: 'note', icon: 'note', label: "Day's note", onClick: () => { primeKeyboard(); onNote(); } },
    { id: 'add', icon: 'add', label: 'Add', onClick: onAddAny },   // one Add for symptoms, supplements and habits
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
              // Dimmed when the night is 2+ days old; the only words are a sync problem, since a
              // signed-out phone otherwise shows an old score as if it were current.
              <span className={`hm-num${sleepWhen(sleep.date).stale ? ' stale' : ''}`}>
                <b className={sleep.score == null ? 'none' : ''}>{sleep.score == null ? '–' : <>{sleep.score}<i className="hm-pc">%</i></>}</b>
                {sleepError && <small>{`${sleepError[0].toUpperCase()}${sleepError.slice(1)} · ${sleepWhen(sleep.date).label}`}</small>}
              </span>
            ) : (
              <span className="hm-num"><b className="none">–</b></span>
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
            {openCard.options.filter((o) => !o.pair).map((opt) => <Option key={opt.label} opt={opt} />)}
            {openCard.options.some((o) => o.pair) && (
              <div className="hm-pair">{openCard.options.filter((o) => o.pair).map((opt) => <Option key={opt.label} opt={opt} />)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
