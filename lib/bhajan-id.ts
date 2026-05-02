export function normalizeBhajanId(id: string) {
  let normalized = String(id || '').trim();
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  return normalized;
}

export function getBhajanIdVariants(id: string) {
  const raw = String(id || '').trim();
  const normalized = normalizeBhajanId(raw);
  const encoded = encodeURIComponent(normalized);
  return Array.from(new Set([raw, normalized, encoded].filter(Boolean)));
}
