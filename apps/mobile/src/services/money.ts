/** Convert canonical integer minor units at the UI boundary without assuming PHP. */
export function formatMinorUnits(minor: number, currencyCode: string): string {
  const normalized = currencyCode.trim().toUpperCase() || 'PHP';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: normalized, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${normalized} ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
}

/** Existing Ask Wise presentation remains PHP-compatible. */
export function formatPhp(minor: number) {
  return `₱${(minor / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

export function parsePhpToMinor(value: string): number | null {
  const normalized = value.trim().toLowerCase().replace(/php|₱|,/g, '').replace(/\s+/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return null;
  const pesos = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(pesos) && pesos >= 0 ? Math.round(pesos * 100) : null;
}
