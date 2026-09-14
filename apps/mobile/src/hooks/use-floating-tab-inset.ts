import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Capsule height + floating gap + breathing room, in addition to the device inset. */
export function useFloatingTabInset() {
  return useSafeAreaInsets().bottom + 96;
}
