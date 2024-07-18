export function isRedirectCallback(redirectUri: string, searchParams: URLSearchParams) {
  const hasCode = searchParams.has('code');
  if (!hasCode) return false;

  const { protocol, host, pathname } = window.location;
  const currentUri = `${protocol}//${host}${pathname}`;
  return currentUri === redirectUri || currentUri === `${redirectUri}/`;
}
