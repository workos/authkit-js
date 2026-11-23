import { CodeExchangeError, RefreshError } from "./errors";
import {
  AuthenticationResponseRaw,
  GetAuthorizationUrlOptions,
} from "./interfaces";
import { deserializeAuthenticationResponse } from "./serializers";
import { toQueryString } from "./utils";

const DEFAULT_HOSTNAME = "api.workos.com";

// HTTP statuses that indicate a transient failure rather than a dead refresh
// token: request timeouts (408), rate limits (429), and 5xx. On these the
// session should be preserved and the refresh retried.
const RETRYABLE_REFRESH_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

interface AuthenticationErrorResponse {
  error?: string;
  error_description?: string;
}

function hasErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === name
  );
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
    const { ok, status, data } = await this.#post(
      "/user_management/authenticate",
      {
        useCookie,
        allowNonJsonErrorBody: true,
        createTimeoutError: (cause) =>
          new RefreshError("Timed out refreshing the session.", {
            cause,
            isTransient: true,
          }),
        body: {
          client_id: this.#clientId,
          grant_type: "refresh_token",
          ...(!useCookie && { refresh_token: refreshToken }),
          organization_id: organizationId,
        },
      },
    );

    if (ok) {
      return deserializeAuthenticationResponse(
        data as AuthenticationResponseRaw,
      );
    }

    const body = data as AuthenticationErrorResponse;
    throw new RefreshError(body.error_description, {
      status,
      error: body.error,
      isTransient: RETRYABLE_REFRESH_STATUS_CODES.has(status),
    });
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
    const { ok, data } = await this.#post("/user_management/authenticate", {
      useCookie,
      createTimeoutError: (cause) =>
        new CodeExchangeError("Timed out exchanging the authorization code.", {
          cause,
        }),
      body: {
        code,
        client_id: this.#clientId,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      },
    });

    if (ok) {
      return deserializeAuthenticationResponse(
        data as AuthenticationResponseRaw,
      );
    }

    const error = data as AuthenticationErrorResponse;
    throw new CodeExchangeError(error.error_description);
  }

  async #post(
    path: "/user_management/authenticate",
    {
      body,
      useCookie,
      createTimeoutError,
      allowNonJsonErrorBody = false,
    }: {
      body: Record<string, unknown>;
      useCookie: boolean;
      createTimeoutError: (cause: unknown) => Error;
      allowNonJsonErrorBody?: boolean;
    },
  ) {
    const signal = AbortSignal.timeout(30_000);
    let response: Response | undefined;
    try {
      response = await fetch(new URL(path, this.#baseUrl), {
        method: "POST",
        ...(useCookie && { credentials: "include" }),
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });
      const data: unknown = await response.json();
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      // A body read can reject with AbortError rather than the timeout reason.
      const cause: unknown = hasErrorName(error, "AbortError")
        ? signal.reason
        : error;
      if (hasErrorName(cause, "TimeoutError")) {
        throw createTimeoutError(cause);
      }
      if (allowNonJsonErrorBody && response && !response.ok) {
        // Keep classifying non-JSON refresh errors by HTTP status.
        return { ok: false, status: response.status, data: {} };
      }
      throw error;
    }
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
