// Forgiving name matching for "is this already on a list?": catches the same name typed with a
// typo, different spacing or punctuation, or only part of it ("magnesium" finds "Magnesium
// glycinate", "magnesim" finds it too).

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Optimal string alignment distance (Levenshtein plus swapped neighbours), stopping early past max.
export function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

// Typos allowed for a word of this length: none for short words, where one letter changes it.
const allowance = (len) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/**
 * How closely `name` matches what was typed, 0 (not at all) to 1 (the same name). Spaces and
 * punctuation are ignored.
 */
export function nameScore(query, name) {
  const q = norm(query), n = norm(name);
  if (q.length < 2 || !n) return 0;
  const qc = q.replace(/ /g, ''), nc = n.replace(/ /g, '');
  if (qc === nc) return 1;
  if (nc.startsWith(qc) || qc.startsWith(nc)) return 0.9;
  if (nc.includes(qc)) return 0.8;
  const whole = editDistance(qc, nc, allowance(Math.max(qc.length, nc.length)));
  if (whole <= allowance(Math.max(qc.length, nc.length))) return 0.85 - whole * 0.05;
  // Word by word: every typed word close to the start of, or the whole of, some word of the name.
  const qw = q.split(' '), nw = n.split(' ');
  let total = 0;
  for (const w of qw) {
    let best = 0;
    for (const v of nw) {
      if (v === w) { best = 1; break; }
      if (w.length >= 3 && v.startsWith(w)) best = Math.max(best, 0.9);
      const a = allowance(Math.max(w.length, v.length));
      if (a && editDistance(w, v, a) <= a) best = Math.max(best, 0.75);
      else if (a && w.length >= 4 && v.length > w.length && editDistance(w, v.slice(0, w.length), a) <= a) best = Math.max(best, 0.65);
    }
    if (!best) return 0;
    total += best;
  }
  return 0.7 * (total / qw.length);
}

/**
 * Items across lists whose name matches `query`, best first. lists: [[kind, items], ...], with
 * hidden and deleted items included; each result says which it is.
 */
export function findSimilar(query, lists, limit = 5) {
  const out = [];
  for (const [kind, items] of lists) {
    for (const item of items || []) {
      const score = nameScore(query, item.name);
      if (score >= 0.45) {
        const status = item.deletedAt ? 'deleted' : item.active === false ? 'hidden' : 'active';
        out.push({ kind, item, score, status });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, limit);
}
