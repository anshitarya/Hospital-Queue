/**
 * Vitest global setup — runs before every test file.
 *
 *  - Loads @testing-library/jest-dom so matchers like `toBeInTheDocument()`
 *    are available on `expect`.
 *  - Stubs APIs that jsdom doesn't implement (scrollIntoView, IntersectionObserver)
 *    so component tests don't blow up when production code calls them.
 */
import '@testing-library/jest-dom/vitest';

// jsdom doesn't ship scrollIntoView — the DepartmentPicker calls it to keep
// the active item in view. We stub it as a no-op so tests can drive the
// keyboard nav.
if (typeof Element !== 'undefined' && !(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: () => undefined,
    writable: true,
    configurable: true,
  });
}

// Node 22+ ships its own (experimental) `localStorage` that gets exposed via
// the global, sometimes shadowing jsdom's proper Storage implementation. The
// Node one is a null-prototype object with no methods unless you start node
// with `--localstorage-file=<path>` — which we don't.
//
// Install a small in-memory polyfill that satisfies the WHATWG Storage API
// so tests of api.ts / auth.ts that touch localStorage actually work.
function installInMemoryStorage(): Storage {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(k) { return map.has(k) ? map.get(k)! : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    key(i) { return Array.from(map.keys())[i] ?? null; },
  };
  return storage;
}

if (typeof window !== 'undefined') {
  const ls = window.localStorage as unknown as { removeItem?: unknown };
  if (typeof ls?.removeItem !== 'function') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: installInMemoryStorage(),
    });
  }
}
