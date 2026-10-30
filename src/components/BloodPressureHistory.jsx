// Every blood pressure reading saved: a trend chart for the chosen window, then the readings newest
// first, grouped by day. Tap a reading made of several cuff readings to see each one; swipe one
// left to delete it (App's undo toast brings it back). Shown inside the Blood pressure overlay.

import { useMemo, useState } from 'react';
import { bpCategory, averageReadings } from '../utils/bloodPressure';
import SwipeRow from './SwipeRow';
import './listUi.css';

const WINDOWS = [
  { id: 'M', days: 30 },
  { id: '3M', days: 91 },
  { id: '6M', days: 182 },
  { id: 'All', days: null },
];
const DAY_MS = 864e5;

const trash = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;

const dayLabel = (d, now) => {
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};

// Two lines, top number and bottom number, over the window; faint guides at 130 and 80.
function Chart({ points, from, to }) {
  const W = 340, H = 150, PAD = 6;
  const vals = points.flatMap((p) => [p.sys, p.dia]).concat([80, 130]);
  const lo = Math.floor((Math.min(...vals) - 5) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
  const x = (t) => PAD + ((t - from) / Math.max(1, to - from)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
  const line = (k) => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p[k]).toFixed(1)}`).join('');
  return (
    <svg className="bph-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trend of ${points.length} readings`}>
      {[80, 130].map((g) => (
        <g key={g}>
          <line x1={0} x2={W} y1={y(g)} y2={y(g)} className="g" />
          <text x={W - 2} y={y(g) - 4} textAnchor="end">{g}</text>
        </g>
      ))}
      {points.length > 1 && <path d={line('sys')} className="sys" />}
      {points.length > 1 && <path d={line('dia')} className="dia" />}
      {points.map((p) => (
        <g key={p.key}>
          <circle cx={x(p.t)} cy={y(p.sys)} r={3} className="sys" />
          <circle cx={x(p.t)} cy={y(p.dia)} r={3} className="dia" />
        </g>
      ))}
    </svg>
  );
}

export default function BloodPressureHistory({ records, onDelete }) {
  const [win, setWin] = useState('M');
  const [openKey, setOpenKey] = useState(null);
  const now = new Date();

  const all = useMemo(() => Object.entries(records || {})
    .filter(([, r]) => r && Number.isFinite(r.sys))
    .map(([key, r]) => ({ key, ...r, t: new Date(r.time).getTime() }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t), [records]);

  if (!all.length) {
    return <p className="bph-empty">No readings yet. Saved readings show up here.</p>;
  }

  const days = WINDOWS.find((w) => w.id === win).days;
  const from = days ? now.getTime() - days * DAY_MS : all[0].t;
  const inWin = all.filter((r) => r.t >= from);
  const avg = averageReadings(inWin);

  // Newest first, one group per day
  const groups = [];
  for (const r of [...all].reverse()) {
    const d = new Date(r.t), label = dayLabel(d, now);
    if (groups[groups.length - 1]?.label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(r);
  }

  return (
    <>
      <div className="bph-top">
        <div className="bph-avg">
          {avg ? <><small>Average</small><b>{avg.sys}/{avg.dia}</b><span>{inWin.length} reading{inWin.length === 1 ? '' : 's'}</span></>
            : <span>No readings in this window</span>}
        </div>
        {inWin.length > 0 && <Chart points={inWin} from={from} to={now.getTime()} />}
        <div className="bph-legend"><span><i className="sys" />Top</span><span><i className="dia" />Bottom</span></div>
        <div className="bph-win" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button key={w.id} type="button" className={w.id === win ? 'on' : ''} aria-pressed={w.id === win} onClick={() => setWin(w.id)}>{w.id}</button>
          ))}
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.label} className="bph-day">
          <h3>{g.label}</h3>
          {g.items.map((r) => {
            const cat = bpCategory(r);
            const many = (r.readings?.length || 0) > 1;
            const open = openKey === r.key;
            return (
              <SwipeRow key={r.key} actions={[{ label: 'Delete', icon: trash, tone: 'warn', onClick: () => onDelete(r.key) }]}>
                <button type="button" className={`bph-row${open ? ' open' : ''}`} aria-expanded={many ? open : undefined}
                  onClick={() => many && setOpenKey(open ? null : r.key)}>
                  <span className="t">{new Date(r.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="v"><b>{r.sys}/{r.dia}</b>{Number.isFinite(r.pulse) && <> · {r.pulse}</>}</span>
                  {many && <span className="n">avg of {r.readings.length}</span>}
                  <i className={`bph-dot ${cat.id}`} title={cat.label} />
                </button>
                {open && (
                  <div className="bph-parts">
                    {r.readings.map((p, i) => (
                      <div key={i}><span>{i + 1}</span>{p.sys}/{p.dia}{Number.isFinite(p.pulse) && ` · pulse ${p.pulse}`}</div>
                    ))}
                  </div>
                )}
              </SwipeRow>
            );
          })}
        </section>
      ))}
    </>
  );
}
