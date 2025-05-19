export function isRedirectCallback(
  redirectUri: string,
  searchParams: URLSearchParams,
) {
  const hasCode = searchParams.has("code");
  if (!hasCode) return false;

  const { pathname: currentPathName } = window.location;
  const redirectPathname = new URL(redirectUri).pathname;
  return (
    currentPathName === redirectPathname ||
    currentPathName === `${redirectPathname}/`
  );
}
