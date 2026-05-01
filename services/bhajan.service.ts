const API_URL = 'https://bhajan.miracall.net/api';

export async function proxyBhajanRequest(payload: unknown) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}
