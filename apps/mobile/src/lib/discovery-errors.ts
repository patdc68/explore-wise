export type DiscoveryErrorKind = 'configuration' | 'network' | 'query';

export class DiscoveryError extends Error {
  constructor(
    public readonly kind: DiscoveryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

export function classifyDiscoveryError(error: unknown): DiscoveryErrorKind {
  if (error instanceof DiscoveryError) return error.kind;

  // React Native fetch failures are TypeErrors and do not include a response status.
  if (error instanceof TypeError) return 'network';

  return 'query';
}

export function discoveryErrorMessage(error: unknown, resource: 'categories' | 'nearby places' | 'place') {
  switch (classifyDiscoveryError(error)) {
    case 'configuration':
      return 'Discovery is not configured on this build.';
    case 'network':
      return 'Check your connection and try again.';
    case 'query':
      return `We couldn’t load ${resource} right now.`;
  }
}
