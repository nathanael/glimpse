import { useCallback, useEffect, useRef, useState } from 'react';
import { getFirebaseDb } from '../utils/firebase';

// Live protocol plan from users/{uid}/protocolPlan. Items arrive from the Glimpse Health MCP
// (Nicole's recommendations) or are planned in the app. The app only writes its own fields
// (ack, linked) on MCP items; it creates, edits and ends items Nate plans himself.
const CACHE_KEY = 'glimpse_protocolPlan';

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
};
const writeCache = (items) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch { /* non-fatal */ }
};
const slug = (s) => (s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

export function useProtocolPlan(user) {
  const [items, setItems] = useState(readCache);
  const [error, setError] = useState(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const col = useCallback(() => {
    const db = getFirebaseDb();
    return db && user?.uid ? db.collection('users').doc(user.uid).collection('protocolPlan') : null;
  }, [user?.uid]);

  useEffect(() => {
    const c = col();
    if (!c) return undefined;
    const unsub = c.onSnapshot(
      (snap) => {
        const next = snap.docs.map((d) => ({ itemId: d.id, ...d.data() }));
        setItems(next);
        writeCache(next);
        setError(null);
      },
      (e) => { console.warn('[useProtocolPlan] listen failed:', e); setError('couldn’t load the plan'); },
    );
    return unsub;
  }, [col]);

  // Optimistic local merge, then the Firestore write (merge keeps every MCP-owned field).
  const patch = useCallback((itemId, fields) => {
    setItems((prev) => {
      const exists = prev.some((i) => i.itemId === itemId);
      const next = exists
        ? prev.map((i) => (i.itemId === itemId ? { ...i, ...fields, ack: { ...(i.ack || {}), ...(fields.ack || {}) } } : i))
        : [...prev, { itemId, ...fields }];
      writeCache(next);
      return next;
    });
    const c = col();
    if (c) c.doc(itemId).set(fields, { merge: true }).catch((e) => { console.warn('[useProtocolPlan] write failed:', e); setError('couldn’t save'); });
  }, [col]);

  const ack = useCallback((itemId, type) => patch(itemId, { ack: { [type]: new Date().toISOString() } }), [patch]);
  const link = useCallback((itemId, linked) => patch(itemId, { linked }), [patch]);

  // Nate's own plan items. Creating or editing one marks it seen, so it never alerts as "added".
  const saveOwnItem = useCallback((data) => {
    const now = new Date().toISOString();
    const itemId = data.itemId || `nate-${slug(data.name)}-${Math.random().toString(36).slice(2, 7)}`;
    const existing = itemsRef.current.find((i) => i.itemId === itemId);
    patch(itemId, {
      ...data, itemId, author: existing?.author || 'nate',
      source: data.source || existing?.source || { type: 'nate', date: now.slice(0, 10) },
      status: data.status || existing?.status || 'planned',
      createdAt: existing?.createdAt || now, updatedAt: now,
      ack: { added: now },
    });
    return itemId;
  }, [patch]);

  const endItem = useCallback((itemId, { endedOn, endReason = '', outcome = '' }) => {
    patch(itemId, { status: 'ended', endedOn, endReason, outcome, updatedAt: new Date().toISOString() });
  }, [patch]);

  return { items, error, ack, link, saveOwnItem, endItem };
}
