const inflight = new Map<string, Promise<unknown>>();

/**
 * Collapse concurrent calls for the same key onto one promise.
 *
 * The scan worker processes a batch of emails in parallel, and a mailbox is
 * dominated by repeat senders — so without this, 8 concurrent messages from
 * the same domain each miss the (still-empty) value cache and independently
 * pay for the same DNS/RDAP/ipinfo round trip. The value caches only help the
 * *next* batch; this one helps the batch in flight. Raising BATCH_SIZE makes
 * the duplication worse, not better.
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
