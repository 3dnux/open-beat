/**
 * zone.js replaces the global Promise with ZoneAwarePromise, which does not
 * implement the newer `Promise.try` used by pdf.js. Provide it when missing.
 */
const P = Promise as unknown as { try?: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> };
if (typeof P.try !== 'function') {
  P.try = (fn, ...args) => new Promise(resolve => resolve(fn(...args)));
}
export {};
