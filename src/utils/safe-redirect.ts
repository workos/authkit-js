/**
 * Returns `true` only when `target` resolves to an http(s) URL, rejecting
 * script-bearing schemes such as `javascript:`, `data:`, and `vbscript:`.
 *
 * Parsing through the URL constructor normalizes the tricky cases (mixed case,
 * embedded tabs/newlines in the scheme) before the protocol check, so denylist
 * string matching is unnecessary. Cross-origin and relative URLs are permitted
 * because a sign-out redirect may legitimately leave the application.
 */
export function isSafeRedirectUrl(target: string, baseOrigin: string): boolean {
  try {
    const { protocol } = new URL(target, baseOrigin);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
