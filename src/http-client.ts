import { RefreshError } from "./errors";
import {
  AuthenticationResponseRaw,
  GetAuthorizationUrlOptions,
} from "./interfaces";
import { deserializeAuthenticationResponse } from "./serializers";
import { toQueryString } from "./utils";

export class HttpClient {
  readonly #baseUrl: string;
  readonly #clientId: string;

  constructor({ baseUrl, clientId }: { baseUrl: string; clientId: string }) {
    this.#baseUrl = baseUrl;
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
    const response = await this.#post("/user_management/authenticate", {
      useCookie,
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
    } else {
      const error = (await response.json()) as any;
      throw new RefreshError(error.error_description);
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
    const response = await this.#post("/user_management/authenticate", {
      useCookie,
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
    } else {
      console.log("error", await response.json());
    }
  }

  #post(
    path: "/user_management/authenticate",
    { body, useCookie }: { body: Record<string, unknown>; useCookie: boolean },
  ) {
    return fetch(new URL(path, this.#baseUrl), {
      method: "POST",
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

    const query = toQueryString({
      connection_id: connectionId,
      context,
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

  getLogoutUrl(sessionId: string) {
    const url = new URL("/user_management/sessions/logout", this.#baseUrl);

    url.searchParams.set("session_id", sessionId);

    return url;
  }
}
