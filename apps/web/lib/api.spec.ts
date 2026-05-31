// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

/**
 * `api()` is a thin fetch wrapper. We stub global fetch and assert:
 *   - URL composition  (BASE_URL + /api + path)
 *   - JSON body serialization + Content-Type header
 *   - Authorization header injection from localStorage
 *   - Successful response parsing
 *   - Error normalization to ApiError (with .status + array messages)
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  // jsdom provides localStorage but reset between tests for cleanliness
  window.localStorage.removeItem('hq_token');
  window.localStorage.removeItem('hq_user');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 400),
    text: async () => JSON.stringify(body),
  };
}

describe('api()', () => {
  it('targets BASE_URL + /api + path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hi: true }));
    await api('/auth/profile');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/profile$/);
  });

  it('sets Content-Type: application/json by default', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await api('/x', { method: 'POST', body: { a: 1 } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('does NOT set Content-Type for FormData bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const fd = new FormData();
    fd.append('x', 'y');
    await api('/x', { method: 'POST', body: fd as unknown as undefined });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('injects Authorization header when token is in localStorage', async () => {
    window.localStorage.setItem('hq_token', 'abc123');
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await api('/x');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer abc123');
  });

  it('omits Authorization header when no token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await api('/x');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('returns parsed JSON payload on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: 42 }));
    const out = await api<{ value: number }>('/x');
    expect(out).toEqual({ value: 42 });
  });

  it('throws ApiError with .status on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'bad' }, { ok: false, status: 400 }),
    );
    const thrown = await api('/x').catch((e) => e);
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ status: 400, message: 'bad' });
  });

  it('joins array messages with "; "', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: ['too short', 'no digit'] }, { ok: false, status: 422 }),
    );
    await expect(api('/x')).rejects.toThrow('too short; no digit');
  });

  it('falls back to "Request failed (NNN)" when no message in payload', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 500 }),
    );
    await expect(api('/x')).rejects.toThrow(/Request failed \(500\)/);
  });

  it('sends no body when none provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await api('/x');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeUndefined();
  });
});
