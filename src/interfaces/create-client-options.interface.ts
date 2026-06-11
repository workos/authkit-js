import {
  AuthenticationResponse,
  OnRefreshResponse,
} from "./authentication-response.interface";
import { createClient } from "../create-client";

export interface CreateClientOptions {
  /**
   * How many seconds before the access token expiration to attempt a refresh.
   */
  refreshBufferInterval?: number;

  apiHostname?: string;
  https?: boolean;
  port?: number;
  redirectUri?: string;
  devMode?: boolean;
  onRedirectCallback?: (_: RedirectParams) => void;
  onBeforeAutoRefresh?: () => boolean;
  onRefresh?: (_: OnRefreshResponse) => void;
  onRefreshFailure?: (args: {
    signIn: Awaited<ReturnType<typeof createClient>>["signIn"];
  }) => void;
}

export interface RedirectParams extends AuthenticationResponse {
  /**
   * The value passed to `signIn`/`signUp` as `state`, round-tripped through the
   * OAuth redirect.
   *
   * SECURITY: `state` travels as plaintext in the URL and is **not** integrity
   * protected — WorkOS cannot validate its contents. Treat anything read from
   * it as untrusted user input. In particular, before navigating to a
   * `state.returnTo`-style value, validate it (e.g. resolve against your origin
   * and reject anything that isn't a same-origin or relative path) so an
   * attacker cannot smuggle a `javascript:` URI or open-redirect target:
   *
   * ```ts
   * onRedirectCallback={({ state }) => {
   *   if (typeof state?.returnTo !== "string") return;
   *   let url;
   *   try {
   *     url = new URL(state.returnTo, window.location.origin);
   *   } catch {
   *     return; // malformed URL — ignore
   *   }
   *   // Navigate to the origin-validated absolute URL, not a value rebuilt from
   *   // url.pathname — a "//evil.com" pathname would redirect off-site.
   *   if (url.origin === window.location.origin) {
   *     window.location.href = url.href;
   *   }
   * }}
   * ```
   *
   * `undefined` when no `state` was provided or when the param could not be
   * parsed as JSON.
   */
  state: Record<string, any> | null | undefined;
}
