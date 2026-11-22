// Protocol plan: dated items (Nicole's recommendations, or Nate's own plans) written by the
// Glimpse Health MCP or in the app, kept in users/{uid}/protocolPlan/{itemId}. Pure helpers only.
//
// Item fields (MCP-owned): itemId, name, kind, dose, unit, frequency, startDate, endDate, condition,
//   reason, watchFor, source {type, date, link, title}, status (planned|active|ended), endReason,
//   outcome, author, createdAt, updatedAt, revision, revisions[].
// App-owned: ack {added, start, end} (ISO times Nate saw each alert), linked {kind, id} (the
//   supplement or factor it was added as).

export const KINDS = [
  { id: 'supplement', label: 'Supplement', color: '#8b5cf6' },
  { id: 'food', label: 'Food', color: '#f97316' },
  { id: 'intervention', label: 'Intervention', color: '#3b82f6' },
  { id: 'test', label: 'Test', color: '#14b8a6' },
];
export const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[0];

export const SOURCE_LABELS = {
  nicole_consult: 'Nicole · consultation',
  nicole_prescription: 'Nicole · prescription',
  nate: 'Your plan',
};

// upcoming → active → ended. Ending is explicit (status) or the planned end date passing.
export const phaseOf = (item, todayKey) => {
  if (!item) return 'ended';
  if (item.status === 'ended') return 'ended';
  if (item.endDate && item.endDate < todayKey) return 'ended';
  if (!item.startDate || item.startDate <= todayKey) return item.status === 'planned' && !item.startDate ? 'upcoming' : 'active';
  return 'upcoming';
};

const seenSince = (ackAt, changedAt) => !!ackAt && (!changedAt || ackAt >= changedAt);

// What Nate should be told on opening the app, most urgent first:
//   end     – an item he started has ended: stop it, and what to note
//   start   – an item starts today (or started while the app was closed)
//   added / updated – a new or revised upcoming item
export const pendingAlerts = (items, todayKey) => {
  const out = [];
  for (const item of items || []) {
    if (!item || item.deleted) continue;
    const ack = item.ack || {};
    const phase = phaseOf(item, todayKey);
    if (phase === 'ended') {
      if (!ack.end && (ack.start || item.linked)) out.push({ type: 'end', item });
    } else if (phase === 'active') {
      if (!ack.start) out.push({ type: 'start', item });
    } else if (item.author !== 'nate' && !seenSince(ack.added, item.updatedAt)) {
      out.push({ type: ack.added ? 'updated' : 'added', item });
    }
  }
  const rank = { end: 0, start: 1, updated: 2, added: 3 };
  return out.sort((a, b) => rank[a.type] - rank[b.type] || (a.item.startDate || '').localeCompare(b.item.startDate || ''));
};

// Date helpers on YYYY-MM-DD keys (local calendar days)
export const addDaysKey = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
export const daysBetween = (a, b) => {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
};

// Timeline window: two weeks back to eight weeks ahead, widened to fit every non-ended item's start.
export const timelineRange = (items, todayKey, { back = 14, ahead = 56 } = {}) => {
  let from = addDaysKey(todayKey, -back);
  let to = addDaysKey(todayKey, ahead);
  for (const i of items || []) {
    if (i.startDate && i.startDate > to && phaseOf(i, todayKey) !== 'ended') to = addDaysKey(i.startDate, 7);
  }
  return { from, to, days: daysBetween(from, to) + 1 };
};

// A bar's position in the window as fractions [0..1]; open-ended items run to the edge.
export const barFor = (item, range) => {
  const start = item.startDate || range.from;
  const end = item.status === 'ended' && item.endedOn ? item.endedOn : item.endDate || (item.kind === 'test' ? start : null);
  const s = Math.max(0, daysBetween(range.from, start));
  const e = end ? Math.min(range.days, daysBetween(range.from, end) + 1) : range.days;
  if (e <= 0 || s >= range.days) return null;
  return { left: s / range.days, width: Math.max(e - s, 1) / range.days, open: !end, clippedLeft: daysBetween(range.from, start) < 0 };
};

export const doseText = (item) => {
  const dose = item.dose !== undefined && item.dose !== null && item.dose !== '' ? `${item.dose}${item.unit ? ` ${item.unit}` : ''}` : '';
  return [dose, item.frequency].filter(Boolean).join(' · ');
};

// Group for the list: active now, upcoming (soonest first), ended (latest first)
export const groupItems = (items, todayKey) => {
  const g = { active: [], upcoming: [], ended: [] };
  for (const i of items || []) if (!i.deleted) g[phaseOf(i, todayKey)].push(i);
  g.active.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  g.upcoming.sort((a, b) => (a.startDate || '9').localeCompare(b.startDate || '9'));
  g.ended.sort((a, b) => (b.endedOn || b.endDate || '').localeCompare(a.endedOn || a.endDate || ''));
  return g;
};

// Supplement definition for "Add to my supplements"
export const stackItemFrom = (item, id, order, todayKey) => ({
  id, name: item.name, unit: item.unit || 'mg', defaultDose: Number(item.dose) || 0,
  description: [item.reason, item.frequency].filter(Boolean).join(' · ').slice(0, 300),
  schedule: { type: 'daily', startDate: item.startDate && item.startDate > todayKey ? item.startDate : todayKey },
  active: true, order, planItemId: item.itemId,
});
export const inputItemFrom = (item, id, order) => ({
  id, name: item.name, category: item.kind === 'food' ? 'food' : 'activity', active: true, order,
  description: (item.reason || '').slice(0, 300), verdict: 'testing', planItemId: item.itemId,
});

// Find an existing definition with the same name (case-insensitive) to link instead of duplicating
export const findByName = (list, name) => {
  const n = (name || '').trim().toLowerCase();
  return (list || []).find((i) => !i.deletedAt && (i.name || '').trim().toLowerCase() === n) || null;
};
