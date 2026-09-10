/** All internal PHP amounts are integer minor units (centavos). Convert only at UI boundaries. */
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
