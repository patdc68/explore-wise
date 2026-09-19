import { createContext, useContext } from 'react';

export type PresentationViewport = Readonly<{
  scrollY: number;
  viewportHeight: number;
}>;

export const presentationViewportContext = createContext<PresentationViewport | null>(null);

export function usePresentationViewport(): PresentationViewport | null {
  return useContext(presentationViewportContext);
}
