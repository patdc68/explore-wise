import type { ViewProps } from 'react-native';

import { ClaySurface } from '@/components/ui/clay';

export function DiscoverySurface({ style, ...props }: ViewProps) {
  return <ClaySurface {...props} elevation="card" style={style} />;
}
