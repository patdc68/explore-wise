export const supportedSources = {
  foursquare_os: {
    code: "foursquare_os",
    displayName: "Foursquare Open Source Places",
  },
} as const;

export type SupportedSourceCode = keyof typeof supportedSources;

export function isSupportedSource(value: string): value is SupportedSourceCode {
  return Object.hasOwn(supportedSources, value);
}

