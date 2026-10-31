import { useCallback, useEffect, useRef, useState } from 'react';
import { getFirebaseDb } from '../utils/firebase';
import { applyFirestoreSnapshot } from '../utils/garminSleepCache';
import { GARMY_BASE, transformRecord } from './useGarminSync';

const CACHE_KEY = 'garminSleepCache';

// Three days before `date` ('YYYY-MM-DD'), so late Garmin fill-ins of recent nights come along too.
function recentFrom(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().slice(0, 10);
}

// The local calendar date `n` days back, as 'YYYY-MM-DD'.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { days: [], lastPushedAt: null };
    const parsed = JSON.parse(raw);
    return { days: parsed.days || [], lastPushedAt: parsed.lastPushedAt || null };
  } catch {
    return { days: [], lastPushedAt: null };
  }
}

function writeCache(days, lastPushedAt) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ days, lastPushedAt }));
  } catch {
    // localStorage quota or disabled — non-fatal
  }
}

export function useGarminSleep(user) {
  const initial = readCache();
  const [days, setDays] = useState(initial.days);
  const [lastPushedAt, setLastPushedAt] = useState(initial.lastPushedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const daysRef = useRef(days);
  const lastPushedAtRef = useRef(lastPushedAt);
  const lastFullRef = useRef(0);

  // Keep refs in sync with state
  daysRef.current = days;
  lastPushedAtRef.current = lastPushedAt;

  const refetch = useCallback(async () => {
    if (!user || !user.uid) return;
    const db = getFirebaseDb();
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const base = db.collection('users').doc(user.uid).collection('garminSleep');
      const curLastPushedAt = lastPushedAtRef.current;
      const curDays = daysRef.current;
      // Each read stands alone, so one that fails (a bad saved mark, a quota error) can't block
      // the others. A cache whose newest night is two or more days old is read from scratch,
      // at most once an hour, so a phone can never sit on an old night while the cloud has newer.
      const safe = (q) => q.get().then((snap) => snap.docs.map((d) => d.data())).catch((e) => {
        console.warn('[useGarminSleep] read failed:', e);
        return null;
      });
      const newest = curDays.length ? curDays[curDays.length - 1].date : null;
      const mark = curLastPushedAt ? new Date(curLastPushedAt) : null;
      const stale = !newest || newest < daysAgo(2);
      const fullDue = stale && Date.now() - lastFullRef.current > 60 * 60 * 1000;
      if (!newest && !fullDue) return;
      let docs;
      if (fullDue) {
        lastFullRef.current = Date.now();
        docs = await safe(base);
      } else {
        const parts = await Promise.all([
          safe(base.where('date', '>=', recentFrom(newest))),
          mark && !Number.isNaN(mark.getTime()) ? safe(base.where('syncedAt', '>', mark).orderBy('syncedAt')) : [],
        ]);
        docs = parts.every((p) => p === null) ? null : parts.flatMap((p) => p || []);
      }
      if (!docs) throw new Error('Could not read sleep nights');
      const { merged, newestTs } = applyFirestoreSnapshot(curDays, curLastPushedAt, docs);
      setDays(merged);
      setLastPushedAt(newestTs);
      writeCache(merged, newestTs);
    } catch (e) {
      console.warn('[useGarminSleep] fetch failed:', e);
      setError(e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.uid]);

  useEffect(() => { refetch(); }, [refetch]);

  // Local dev without sign-in: read every night straight from the garmy server
  useEffect(() => {
    if (!import.meta.env.DEV || (user && user.uid)) return;
    let cancelled = false;
    fetch(`${GARMY_BASE}/api/sleep`)
      .then((res) => (res.ok ? res.json() : []))
      .then((records) => {
        if (cancelled || !records.length) return;
        const local = records
          .map(transformRecord)
          .filter((r) => r.date)
          .map((r) => ({ ...r, syncedAt: r.syncedAt.toISOString() }))
          .sort((a, b) => a.date.localeCompare(b.date));
        setDays(local);
        writeCache(local, null);
      })
      .catch(() => { /* garmy server not running — keep whatever is cached */ });
    return () => { cancelled = true; };
  }, [user && user.uid]);

  // A phone has no Garmin bridge of its own: new nights arrive in Firestore from the Mac. Check
  // again whenever the app comes back to the front, not only at launch.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  useEffect(() => {
    // Incremental: the bridge stamps syncedAt on every night it writes, so
    // syncedAt > lastPushedAt picks them up without re-reading every night.
    const handler = () => refetch();
    window.addEventListener('garmin-sleep-synced', handler);
    return () => window.removeEventListener('garmin-sleep-synced', handler);
  }, [refetch]);

  return { days, loading, error, refetch };
}
