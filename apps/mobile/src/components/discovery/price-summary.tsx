import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMinorUnits, formatPhp } from '@/services/money';
import type { PricedNearbyPlace } from '@/services/places';

const money = (amount: number, currencyCode?: string | null) => currencyCode ? formatMinorUnits(amount, currencyCode) : formatPhp(amount);

export function PriceSummary({ place, currencyCode, compact = false }: { place: Pick<PricedNearbyPlace, 'has_price' | 'pricing_basis' | 'pricing_status' | 'price_source_label' | 'estimated_group_min_minor' | 'estimated_group_max_minor' | 'budget_status'> & { currency_code?: string | null }; currencyCode?: string | null; compact?: boolean }) {
  const theme = useTheme();
  if (!place.has_price && compact) return <ThemedText style={Typography.metadata} themeColor="textSecondary">Price not available yet</ThemedText>;
  if (!place.has_price) return <View style={[styles.unknown, { backgroundColor: theme.unknownSoft }]}><ThemedText type="smallBold" style={{ color: theme.unknown }}>Price not available yet</ThemedText></View>;
  const evidenceCurrency = place.currency_code?.toUpperCase() ?? null;
  const currencyMismatch = Boolean(currencyCode && (!evidenceCurrency || evidenceCurrency !== currencyCode.toUpperCase()));
  if (currencyMismatch && compact) return <ThemedText style={Typography.metadata} themeColor="textSecondary">Price currency unverified</ThemedText>;
  if (currencyMismatch) return <View style={[styles.unknown, { backgroundColor: theme.unknownSoft }]}><ThemedText type="smallBold" style={{ color: theme.unknown }}>Price currency unverified</ThemedText></View>;
  const minimum = place.estimated_group_min_minor;
  const maximum = place.estimated_group_max_minor;
  const spend = minimum === null || maximum === null ? null : minimum === maximum ? money(minimum, currencyCode) : `${money(minimum, currencyCode)}–${money(maximum, currencyCode)}`;
  const status = place.budget_status === 'likely_fits' ? 'Likely fits' : place.budget_status === 'fits' ? 'Fits' : place.budget_status === 'may_exceed' ? 'May exceed' : place.budget_status === 'likely_exceeds' ? 'Likely exceeds' : place.budget_status === 'exceeds' ? 'Exceeds' : null;
  const statusTone = status === 'Fits' || status === 'Likely fits' ? { color: theme.success, backgroundColor: theme.successSoft } : status === 'May exceed' ? { color: theme.warning, backgroundColor: theme.warningSoft } : { color: theme.error, backgroundColor: theme.errorSoft };
  const provenance = place.pricing_status === 'free' ? 'Free admission' : place.pricing_basis === 'branch_verified' ? 'Branch verified' : place.pricing_basis === 'brand_reference' ? 'Official brand reference' : place.pricing_basis === 'place_reference' ? 'Official place reference' : place.price_source_label;
  if (compact) {
    const compactProvenance = place.pricing_basis === 'brand_reference' ? 'Brand reference' : provenance;
    return <View style={styles.wrap}>
      {place.pricing_status === 'free' ? <ThemedText style={[styles.compactPrice, { color: theme.success }]}>Free admission</ThemedText> : spend ? <ThemedText style={styles.compactPrice}>{spend}</ThemedText> : null}
      {place.pricing_status !== 'free' ? <ThemedText style={Typography.caption} themeColor="textSecondary">{compactProvenance}</ThemedText> : null}
      {status ? <ThemedText style={[Typography.caption, { color: statusTone.color }]}>{status}</ThemedText> : null}
    </View>;
  }
  return <View style={styles.wrap}>
    {place.pricing_status === 'free' ? <ThemedText style={[Typography.price, { color: theme.success }]}>Free admission</ThemedText> : spend ? <ThemedText style={Typography.price}>{spend}</ThemedText> : null}
    <ThemedText type="small" themeColor="textSecondary">{provenance}</ThemedText>
    {place.pricing_basis === 'brand_reference' ? <ThemedText type="small" themeColor="textSecondary">Based on the brand&apos;s official menu. Actual prices may vary by location or ordering channel.</ThemedText> : null}
    {status ? <View style={[styles.badge, statusTone]}><ThemedText style={[Typography.badge, { color: statusTone.color }]}>{status}</ThemedText></View> : null}
  </View>;
}
const styles = StyleSheet.create({ wrap: { gap: Spacing.xs }, compactPrice: { ...Typography.body, fontWeight: Typography.label.fontWeight }, badge: { alignSelf: 'flex-start', borderRadius: Radius.chip, marginTop: Spacing.xs, paddingHorizontal: 9, paddingVertical: 5 }, unknown: { alignSelf: 'flex-start', borderRadius: Radius.chip, paddingHorizontal: 10, paddingVertical: 6 } });
