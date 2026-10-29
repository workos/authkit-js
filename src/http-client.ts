import { CodeExchangeError, RefreshError } from "./errors";
import {
  AuthenticationResponseRaw,
  GetAuthorizationUrlOptions,
} from "./interfaces";
import { deserializeAuthenticationResponse } from "./serializers";
import { toQueryString } from "./utils";

const DEFAULT_HOSTNAME = "api.workos.com";

// Kept below the refresh lock's acquisition timeout (10s) so a request that
// never settles (e.g. on a stale connection after the device sleeps) releases
// the cross-tab refresh lock before other tabs give up waiting for it.
const REQUEST_TIMEOUT_MS = 8_000;

// HTTP statuses that indicate a transient failure rather than a dead refresh
// token: request timeouts (408), rate limits (429), and 5xx. On these the
// session should be preserved and the refresh retried.
const RETRYABLE_REFRESH_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

interface AuthenticationErrorResponse {
  error?: string;
  error_description?: string;
}

export class HttpClient {
  readonly #baseUrl: string;
  readonly #clientId: string;

  constructor({
    clientId,
    hostname = DEFAULT_HOSTNAME,
    port,
    https = true,
  }: {
    clientId: string;
    hostname?: string;
    port?: number;
    https?: boolean;
  }) {
    this.#baseUrl = `${https ? "https" : "http"}://${hostname}${
      port ? `:${port}` : ""
    }`;
    this.#clientId = clientId;
  }

  async authenticateWithRefreshToken({
    refreshToken,
    organizationId,
    useCookie,
  }: {
    refreshToken: string | undefined;
    organizationId?: string;
    useCookie: boolean;
  }) {
    return this.#withTimeout(async (signal) => {
      const response = await this.#post("/user_management/authenticate", {
        useCookie,
        signal,
        body: {
          client_id: this.#clientId,
          grant_type: "refresh_token",
          ...(!useCookie && { refresh_token: refreshToken }),
          organization_id: organizationId,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as AuthenticationResponseRaw;
        return deserializeAuthenticationResponse(data);
      }

      const { status } = response;
      const body = await this.#parseErrorBody(response);
      throw new RefreshError(body.error_description, {
        status,
        error: body.error,
        isTransient: RETRYABLE_REFRESH_STATUS_CODES.has(status),
      });
    });
  }

  async #parseErrorBody(
    response: Response,
  ): Promise<AuthenticationErrorResponse> {
    try {
      return (await response.json()) as AuthenticationErrorResponse;
    } catch {
      // A 5xx (or gateway) response may carry a non-JSON body; treat it as an
      // empty error payload so the status still drives classification.
      return {};
    }
  }

  async authenticateWithCode({
    code,
    codeVerifier,
    useCookie,
  }: {
    code: string;
    codeVerifier: string;
    useCookie: boolean;
  }) {
    return this.#withTimeout(async (signal) => {
      const response = await this.#post("/user_management/authenticate", {
        useCookie,
        signal,
        body: {
          code,
          client_id: this.#clientId,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as AuthenticationResponseRaw;
        return deserializeAuthenticationResponse(data);
      }

      const error = await response.json();
      throw new CodeExchangeError(error.error_description);
    });
  }

  /**
   * Runs `request` with an abort signal that fires after `REQUEST_TIMEOUT_MS`.
   * The timeout covers reading the response body as well as the initial fetch,
   * since either can hang on a stale connection.
   *
   * A timed-out request rejects with an abort error rather than a
   * `RefreshError`, which create-client treats as transient (the session is
   * preserved and the refresh retried).
   */
  async #withTimeout<T>(
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await request(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  #post(
    path: "/user_management/authenticate",
    {
      body,
      useCookie,
      signal,
    }: {
      body: Record<string, unknown>;
      useCookie: boolean;
      signal: AbortSignal;
    },
  ) {
    return fetch(new URL(path, this.#baseUrl), {
      method: "POST",
      signal,
      ...(useCookie && { credentials: "include" }),
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  getAuthorizationUrl({
    connectionId,
    context,
    domainHint,
    loginHint,
    organizationId,
    provider = "authkit",
    redirectUri,
    state,
    screenHint,
    passwordResetToken,
    invitationToken,
    codeChallenge,
    codeChallengeMethod,
  }: GetAuthorizationUrlOptions) {
    if (!provider && !connectionId && !organizationId) {
      throw new TypeError(
        `Incomplete arguments. Need to specify either a 'connectionId', 'organizationId', or 'provider'.`,
      );
    }

    if (provider !== "authkit" && screenHint) {
      throw new TypeError(
        `'screenHint' is only supported for 'authkit' provider`,
      );
    }

    if (context) {
      console.warn(
        `\`context\` is deprecated. We previously required initiate login endpoints to return the
\`context\` query parameter when getting the authorization URL. This is no longer necessary.`,
      );
    }

    const query = toQueryString({
      connection_id: connectionId,
      organization_id: organizationId,
      domain_hint: domainHint,
      login_hint: loginHint,
      provider,
      client_id: this.#clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      screen_hint: screenHint,
      invitation_token: invitationToken,
      password_reset_token: passwordResetToken,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    });

    return `${this.#baseUrl}/user_management/authorize?${query}`;
  }

  getLogoutUrl({
    sessionId,
    returnTo,
  }: {
    sessionId: string;
    returnTo: string | undefined;
  }) {
    const url = new URL("/user_management/sessions/logout", this.#baseUrl);

    url.searchParams.set("session_id", sessionId);
    if (returnTo) {
      url.searchParams.set("return_to", returnTo);
    }

    return url;
  }
}
