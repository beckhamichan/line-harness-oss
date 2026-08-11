export function buildTrackedLinkRedirect(redirect: string, lineUserId: string, allowedOrigin: string): string {
  const destination = new URL(redirect);
  if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
    throw new Error('Unsupported redirect protocol');
  }
  if (destination.origin !== new URL(allowedOrigin).origin) {
    throw new Error('Unsupported redirect origin');
  }
  destination.searchParams.set('lu', lineUserId);
  return destination.toString();
}
