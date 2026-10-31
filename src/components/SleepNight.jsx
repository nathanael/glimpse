// Sleep, opened from Home's Sleep tile: one Garmin night as a card (score ring, time asleep against
// need, stage bar), four vitals and the seven nights up to it, filling the screen. The date sits in a
// bar at the bottom with big arrows; swiping sideways or tapping a bar also moves between nights.
// The page is locked in place. Numbers come from utils/sleepNight.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import { sortedNights, nightSummary } from '../utils/sleepNight';
import { formatMinutes } from '../utils/homeStats';
import { haptic } from '../utils/helpers';
import { CloseButton, useRiseIn } from './overlay';
import './sleepNight.css';

const RING_R = 49, RING_C = 2 * Math.PI * RING_R;

// The bottom bar's two lines: the night's date, and how long ago it was.
function nightDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  const night = new Date(y, m - 1, d), now = new Date();
  const age = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - night) / 864e5);
  return {
    label: night.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
    ago: age <= 0 ? 'Last night' : age === 1 ? '2 nights ago' : `${age + 1} nights ago`,
  };
}

const weekday = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'narrow' });
};

function Hm({ minutes }) {
  if (minutes == null) return <>–</>;
  return <>{Math.floor(minutes / 60)}h {String(minutes % 60).padStart(2, '0')}<em>m</em></>;
}

export default function SleepNight({ days, onClose }) {
  const nights = useMemo(() => sortedNights(days), [days]);
  const [index, setIndex] = useState(() => nights.length - 1);
  const rootRef = useRef(null);
  const swipe = useRef(null);
  useRiseIn(rootRef);

  // The page is locked in place: no scroll, rubber-band or drag. Sideways swipes still change night.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const stop = (e) => e.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  // A new night arriving while open keeps the page on the latest one.
  const count = nights.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count !== prevCount.current && index === prevCount.current - 1) setIndex(count - 1);
    prevCount.current = count;
  }, [count, index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(count - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, count]);

  const night = nightSummary(nights, Math.min(index, count - 1));
  const go = (i) => {
    if (i < 0 || i >= count || i === index) return;
    haptic('light');
    setIndex(i);
  };

  const swipeHandlers = {
    onPointerDown: (e) => { swipe.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e) => {
      const s = swipe.current;
      swipe.current = null;
      if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? index + 1 : index - 1);
    },
    onPointerCancel: () => { swipe.current = null; },
  };

  const st = night?.stages;
  const when = night ? nightDate(night.date) : null;
  const pct = night?.score != null ? Math.max(0, Math.min(1, night.score / 100)) : 0;

  return (
    <div className="sn" ref={rootRef} role="dialog" aria-label="Sleep">
      <div className="sn-in">
        <div className="sn-head">
          <CloseButton label="Close sleep" onClick={onClose} />
        </div>

        {!night ? (
          <div className="sn-empty">No Garmin nights have synced yet.</div>
        ) : (
          <div className="sn-body" {...swipeHandlers}>
            <section className="sn-hero" key={night.date}>
              <div className="sn-top">
                <div className="sn-ring">
                  <svg viewBox="0 0 112 112" aria-hidden="true">
                    <circle cx="56" cy="56" r={RING_R} className="track" />
                    {night.score != null && (
                      <circle cx="56" cy="56" r={RING_R} className="fill" strokeDasharray={`${RING_C * pct} ${RING_C}`} transform="rotate(-90 56 56)" />
                    )}
                  </svg>
                  <span><b>{night.score ?? '–'}</b><small>{night.score != null ? night.verdict : 'No score'}</small></span>
                </div>
                <div className="sn-time">
                  <small>Time asleep</small>
                  <b><Hm minutes={night.asleep} /></b>
                  {night.need && <span className={`t-${night.need.tone}`}>{night.need.text}</span>}
                </div>
              </div>
              <div className="sn-stages" aria-hidden="true">
                <i className="deep" style={{ flex: st.deep }} />
                <i className="light" style={{ flex: st.light }} />
                <i className="rem" style={{ flex: st.rem }} />
                <i className="awake" style={{ flex: st.awake }} />
              </div>
              <dl className="sn-legend">
                <div><dt>Deep</dt><dd>{formatMinutes(st.deep)}</dd></div>
                <div><dt>Light</dt><dd>{formatMinutes(st.light)}</dd></div>
                <div><dt>REM</dt><dd>{formatMinutes(st.rem)}</dd></div>
                <div><dt>Awake</dt><dd>{st.awake < 60 ? `${st.awake}m` : formatMinutes(st.awake)}</dd></div>
              </dl>
            </section>

            {night.vitals.length > 0 && (
              <div className="sn-vitals">
                {night.vitals.map((v) => (
                  <div key={v.key} className="sn-vital">
                    <span className="lbl"><i className={`dot t-${v.tone}`} />{v.label}</span>
                    <b>{v.value}{v.unit && <em>{v.unit === '%' ? '%' : ` ${v.unit}`}</em>}</b>
                    <small>{v.sub}</small>
                  </div>
                ))}
              </div>
            )}

            <div className="sn-week">
              <div className="sn-week-h"><span>7 nights</span>{night.weekAvg != null && <span>Avg {formatMinutes(night.weekAvg)}</span>}</div>
              <div className="sn-bars">
                {night.week.map((w) => (
                  <button key={w.date} type="button" disabled={w.index < 0}
                    className={w.date === night.date ? 'on' : ''}
                    aria-label={`${w.date}${w.minutes != null ? `, ${formatMinutes(w.minutes)}` : ', no data'}`}
                    aria-pressed={w.date === night.date}
                    onClick={() => go(w.index)}>
                    <b><i style={{ height: w.minutes != null && night.weekMax ? `${Math.max(6, (w.minutes / night.weekMax) * 100)}%` : '0%' }} /></b>
                    <span>{weekday(w.date)}</span>
                  </button>
                ))}
              </div>
            </div>

            <nav className="sn-nav" aria-label="Choose night">
              <button type="button" aria-label="Previous night" disabled={index <= 0} onClick={() => go(index - 1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <div className="sn-date" aria-live="polite" key={night.date}>
                <b>{when.label}</b>
                <small>{when.ago}</small>
              </div>
              <button type="button" aria-label="Next night" disabled={index >= count - 1} onClick={() => go(index + 1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
