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
      let docs;
      if (curLastPushedAt) {
        // Two reads, merged: nights stamped since the last fetch, and every night from a few days
        // before the newest one cached. The date read doesn't depend on the cached syncedAt
        // mark, so a phone whose mark got ahead of the Mac's pushes still catches up.
        const newest = curDays.length ? curDays[curDays.length - 1].date : null;
        const from = newest ? recentFrom(newest) : null;
        const [bySync, byDate] = await Promise.all([
          base.where('syncedAt', '>', new Date(curLastPushedAt)).orderBy('syncedAt').get(),
          from ? base.where('date', '>=', from).get() : Promise.resolve({ docs: [] }),
        ]);
        docs = [...byDate.docs, ...bySync.docs].map(d => d.data());
      } else {
        docs = (await base.get()).docs.map(d => d.data());
      }
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
