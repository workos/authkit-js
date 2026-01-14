import {
  AuthenticationResponse,
  CreateClientOptions,
  OnRefreshResponse,
  User,
} from "./interfaces";
import { NoClientIdProvidedException } from "./exceptions";
import {
  isRedirectCallback,
  memoryStorage,
  createPkceChallenge,
  setSessionData,
  removeSessionData,
  storageKeys,
} from "./utils";
import { getRefreshToken, getClaims } from "./utils/session-data";
import { RedirectParams } from "./interfaces/create-client-options.interface";
import { LoginRequiredError, NoSessionError, RefreshError } from "./errors";
import { withLock, LockError } from "./utils/locking";
import { HttpClient } from "./http-client";

interface RedirectOptions {
  /**
   *  @deprecated We previously required initiate login endpoints to return the `context`
   *  query parameter when getting the authorization URL. This is no longer necessary.
   */
  context?: string;
  invitationToken?: string;
  loginHint?: string;
  organizationId?: string;
  passwordResetToken?: string;
  state?: any;
  screenHint?: "sign-in" | "sign-up";
}

type State =
  | { tag: "INITIAL" }
  | { tag: "AUTHENTICATING"; response: Promise<AuthenticationResponse> }
  | { tag: "AUTHENTICATED" }
  | { tag: "ERROR" };

export const ORGANIZATION_ID_SESSION_STORAGE_KEY = "workos_organization_id";

const REFRESH_LOCK_NAME = "WORKOS_REFRESH_SESSION";

export class Client {
  #state: State;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;

  readonly #httpClient: HttpClient;
  readonly #redirectUri: string;
  readonly #devMode: boolean;
  readonly #onBeforeAutoRefresh: () => boolean;
  readonly #onRedirectCallback: (params: RedirectParams) => void;
  readonly #onRefreshCallback:
    | ((response: OnRefreshResponse) => void)
    | undefined;
  readonly #onRefreshFailure:
    | ((params: { signIn: () => Promise<void> }) => void)
    | undefined;
  readonly #refreshBufferInterval: number;

  constructor(
    clientId: string,
    {
      apiHostname: hostname,
      https,
      port,
      redirectUri = window.origin,
      devMode = location.hostname === "localhost" ||
        location.hostname === "127.0.0.1",
      // refresh if this is true
      onBeforeAutoRefresh = () => {
        return !document.hidden;
      },
      onRedirectCallback = (_: RedirectParams) => {},
      onRefresh,
      onRefreshFailure,
      refreshBufferInterval = 10,
    }: CreateClientOptions = {},
  ) {
    if (!clientId) {
      throw new NoClientIdProvidedException();
    }

    this.#httpClient = new HttpClient({ clientId, hostname, port, https });
    this.#devMode = devMode;
    this.#redirectUri = redirectUri;
    this.#state = { tag: "INITIAL" };
    this.#onBeforeAutoRefresh = onBeforeAutoRefresh;
    this.#onRedirectCallback = onRedirectCallback;
    this.#onRefreshCallback = onRefresh;
    this.#onRefreshFailure = onRefreshFailure;
    this.#refreshBufferInterval = refreshBufferInterval;
  }

  async initialize() {
    if (this.#state.tag !== "INITIAL") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (isRedirectCallback(this.#redirectUri, searchParams)) {
      await this.#handleCallback();
    } else if (
      document.cookie.includes("workos-has-session=") ||
      getRefreshToken({ devMode: this.#devMode })
    ) {
      try {
        await this.#refreshSession();
        this.#scheduleAutomaticRefresh();
      } catch {
        // this is expected to fail if a user doesn't
        // have a session. do nothing.
      }
    }
  }

  async getSignInUrl(opts: Omit<RedirectOptions, "screenHint"> = {}) {
    const url = await this.#getAuthorizationUrl({ ...opts });
    return url;
  }

  async getSignUpUrl(opts: Omit<RedirectOptions, "screenHint"> = {}) {
    const url = await this.#getAuthorizationUrl({
      ...opts,
      screenHint: "sign-up",
    });
    return url;
  }

  async signIn(opts: Omit<RedirectOptions, "screenHint"> = {}) {
    const url = await this.#getAuthorizationUrl({ ...opts });
    window.location.assign(url);
  }

  async signUp(opts: Omit<RedirectOptions, "screenHint"> = {}) {
    const url = await this.#getAuthorizationUrl({
      ...opts,
      screenHint: "sign-up",
    });
    window.location.assign(url);
  }

  signOut(options?: { returnTo?: string; navigate?: true }): void;
  signOut(options?: { returnTo?: string; navigate: false }): Promise<void>;
  signOut(
    options: { returnTo?: string; navigate?: boolean } = { navigate: true },
  ): void | Promise<void> {
    const { navigate = true, returnTo } = options;
    const accessToken = memoryStorage.getItem(storageKeys.accessToken);
    if (typeof accessToken !== "string") {
      if (!returnTo) {
        if (navigate) {
          throw new NoSessionError();
        }

        return Promise.reject(new NoSessionError());
      }
      if (navigate) {
        window.location.assign(returnTo);
        return;
      }
      return Promise.resolve();
    }
    const { sid: sessionId } = getClaims(accessToken);

    const url = this.#httpClient.getLogoutUrl({
      sessionId,
      returnTo,
    });

    if (url) {
      removeSessionData({ devMode: this.#devMode });
      sessionStorage.removeItem(ORGANIZATION_ID_SESSION_STORAGE_KEY);

      if (navigate) {
        window.location.assign(url);
      } else {
        return new Promise(async (resolve) => {
          fetch(url, {
            mode: "no-cors",
            credentials: "include",
          })
            .catch((error) => {
              console.warn("AuthKit: Failed to send logout request", error);
            })
            .finally(resolve);
        });
      }
    }
  }

  async getAccessToken(options?: { forceRefresh?: boolean }): Promise<string> {
    if (options?.forceRefresh || this.#shouldRefresh()) {
      try {
        await this.#refreshSession();
      } catch (err) {
        if (err instanceof RefreshError) {
          throw new LoginRequiredError();
        } else {
          throw err;
        }
      }
    }

    const accessToken = this.#getAccessToken();
    if (!accessToken) {
      throw new LoginRequiredError();
    }

    return accessToken;
  }

  getUser() {
    const user = memoryStorage.getItem(storageKeys.user);
    return user ? (user as User) : null;
  }

  dispose() {
    clearTimeout(this.#refreshTimer);
    memoryStorage.reset();
  }

  async #handleCallback() {
    if (this.#state.tag !== "INITIAL") {
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const state = stateParam ? JSON.parse(stateParam) : undefined;

    // grab the previously stored code verifier from session storage
    const codeVerifier = window.sessionStorage.getItem(
      storageKeys.codeVerifier,
    );

    if (code) {
      if (codeVerifier) {
        try {
          this.#state = {
            tag: "AUTHENTICATING",
            response: this.#httpClient.authenticateWithCode({
              code,
              codeVerifier,
              useCookie: this.#useCookie,
            }),
          };
          const authenticationResponse = await this.#state.response;

          if (authenticationResponse) {
            this.#state = { tag: "AUTHENTICATED" };
            this.#scheduleAutomaticRefresh();
            setSessionData(authenticationResponse, { devMode: this.#devMode });
            this.#onRefresh(authenticationResponse);
            this.#onRedirectCallback({ state, ...authenticationResponse });
          }
        } catch (error) {
          this.#state = { tag: "ERROR" };
          console.error(error);
        }
      } else {
        this.#state = { tag: "ERROR" };
        console.error(`Couldn't exchange code.

An authorization_code was supplied for a login which did not originate at the application. This could happen for various reasons:

* This could have been an attempted Login CSRF attack. You were not affected.
* The developer may not have configured a Login Initiation endpoint.`);
      }
    }

    // Remove code from search params
    const cleanUrl = new URL(window.location.toString());
    cleanUrl.search = "";
    window.sessionStorage.removeItem(storageKeys.codeVerifier);
    window.history.replaceState({}, "", cleanUrl);
  }

  async #scheduleAutomaticRefresh() {
    this.#refreshTimer = setTimeout(() => {
      if (this.#shouldRefresh() && this.#onBeforeAutoRefresh()) {
        this.#refreshSession()
          .catch((e) => {
            console.debug(e);
          })
          .finally(() => this.#scheduleAutomaticRefresh());
      } else {
        this.#scheduleAutomaticRefresh();
      }
    }, 1000);
  }

  /**
   * Switches to the requested organization.
   *
   * Redirects to the hosted login page for the given organization if the
   * switch is unsuccessful.
   */
  async switchToOrganization({
    organizationId,
    signInOpts = {},
  }: {
    organizationId: string;
    signInOpts?: Omit<RedirectOptions, "type" | "organizationId">;
  }) {
    try {
      await this.#refreshSession({ organizationId });
    } catch (error) {
      if (error instanceof RefreshError) {
        this.signIn({ ...signInOpts, organizationId });
      } else {
        throw error;
      }
    }
  }

  async #refreshSession({ organizationId }: { organizationId?: string } = {}) {
    if (this.#state.tag === "AUTHENTICATING") {
      await this.#state.response;
      return;
    }

    const beginningState = this.#state;

    this.#state = {
      tag: "AUTHENTICATING",
      response: this.#doRefresh({ organizationId, beginningState }),
    };

    await this.#state.response;
  }

  async #doRefresh({
    organizationId,
    beginningState,
  }: {
    organizationId?: string;
    beginningState: State;
  }): Promise<AuthenticationResponse> {
    try {
      return await withLock(REFRESH_LOCK_NAME, async () => {
        if (organizationId) {
          sessionStorage.setItem(
            ORGANIZATION_ID_SESSION_STORAGE_KEY,
            organizationId,
          );
        } else {
          const accessToken = this.#getAccessToken();
          if (accessToken) {
            organizationId = getClaims(accessToken)?.org_id;
          } else {
            organizationId =
              sessionStorage.getItem(ORGANIZATION_ID_SESSION_STORAGE_KEY) ??
              undefined;
          }
        }

        const authenticationResponse =
          await this.#httpClient.authenticateWithRefreshToken({
            refreshToken: getRefreshToken({ devMode: this.#devMode }),
            organizationId,
            useCookie: this.#useCookie,
          });

        this.#state = { tag: "AUTHENTICATED" };
        setSessionData(authenticationResponse, { devMode: this.#devMode });
        this.#onRefresh(authenticationResponse);
        return authenticationResponse;
      });
    } catch (error) {
      if (
        error instanceof LockError &&
        error.name === "AcquisitionTimeoutError"
      ) {
        console.warn("Couldn't acquire refresh lock.");

        // preserving the original state so that we can try again next time
        this.#state = beginningState;
        throw error;
      }

      if (beginningState.tag !== "INITIAL") {
        console.debug(error);
      }

      if (error instanceof RefreshError) {
        removeSessionData({ devMode: this.#devMode });
        sessionStorage.removeItem(ORGANIZATION_ID_SESSION_STORAGE_KEY);
        // fire the refresh failure UNLESS this is the initial refresh attempt
        // (the initial refresh is expected to fail if a user has not logged in
        // ever or recently)
        beginningState.tag !== "INITIAL" &&
          this.#onRefreshFailure &&
          this.#onRefreshFailure({ signIn: this.signIn.bind(this) });

        this.#state = { tag: "ERROR" };
      } else {
        // transitioning into the AUTHENTICATED state ensures that we will
        // attempt to refresh the token on future getAccessToken calls()
        //
        // this could maybe be a new state for clarity? TEMPORARY_ERROR?
        this.#state = { tag: "AUTHENTICATED" };
      }

      throw error;
    }
  }

  #shouldRefresh() {
    switch (this.#state.tag) {
      case "INITIAL":
      case "AUTHENTICATING":
        return true;
      case "ERROR":
        return false;
      case "AUTHENTICATED":
        const accessToken = memoryStorage.getItem(storageKeys.accessToken) as
          | string
          | undefined;
        const expiresAt = memoryStorage.getItem(storageKeys.expiresAt) as
          | number
          | undefined;

        if (!accessToken || !expiresAt) {
          return true;
        }

        const tokenRefreshBufferInSeconds = this.#refreshBufferInterval * 1000;
        const refreshTime = expiresAt - tokenRefreshBufferInSeconds;
        return refreshTime < Date.now();
    }
  }

  async #getAuthorizationUrl({
    context,
    invitationToken,
    loginHint,
    organizationId,
    passwordResetToken,
    state,
    screenHint,
  }: RedirectOptions) {
    const { codeVerifier, codeChallenge } = await createPkceChallenge();
    // store the code verifier in session storage for later use (after the redirect back from authkit)
    window.sessionStorage.setItem(storageKeys.codeVerifier, codeVerifier);
    const url = this.#httpClient.getAuthorizationUrl({
      codeChallenge,
      codeChallengeMethod: "S256",
      context,
      invitationToken,
      loginHint,
      organizationId,
      passwordResetToken,
      redirectUri: this.#redirectUri,
      screenHint,
      state: state ? JSON.stringify(state) : undefined,
    });

    return url;
  }

  #getAccessToken() {
    return memoryStorage.getItem(storageKeys.accessToken) as string | undefined;
  }

  get #useCookie() {
    return !this.#devMode;
  }

  async #onRefresh(authenticationResponse: AuthenticationResponse) {
    if (this.#onRefreshCallback) {
      // there's no good reason for client code to access the refresh token
      const { refreshToken: _refreshToken, ...onRefreshData } =
        authenticationResponse;
      this.#onRefreshCallback(onRefreshData);
    }
  }
}

export async function createClient(
  clientId: string,
  options: CreateClientOptions = {},
) {
  const client = new Client(clientId, options);

  await client.initialize();

  return client;
}
