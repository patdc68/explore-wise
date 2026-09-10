export function createPrimarySourceIdentity(sourceCode: string, sourcePlaceId: string): string {
  return `${encodeURIComponent(sourceCode)}:${encodeURIComponent(sourcePlaceId)}`;
}

