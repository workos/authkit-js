import {
  AuthenticationResponse,
  CreateClientOptions,
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
import { LoginRequiredError, RefreshError } from "./errors";
import { withLock, LockError } from "./utils/locking";
import { HttpClient } from "./http-client";

interface RedirectOptions {
  context?: string;
  invitationToken?: string;
  loginHint?: string;
  organizationId?: string;
  passwordResetToken?: string;
  state?: any;
  type: "sign-in" | "sign-up";
}

type State = "INITIAL" | "AUTHENTICATING" | "AUTHENTICATED" | "ERROR";

const ORGANIZATION_ID_SESSION_STORAGE_KEY = "workos_organization_id";

const REFRESH_LOCK_NAME = "WORKOS_REFRESH_SESSION";

export class Client {
  #state: State;
  #refreshTimer: ReturnType<typeof setTimeout> | undefined;

  readonly #httpClient: HttpClient;
  readonly #redirectUri: string;
  readonly #devMode: boolean;
  readonly #onBeforeAutoRefresh: () => boolean;
  readonly #onRedirectCallback: (params: RedirectParams) => void;
  readonly #onRefresh: ((response: AuthenticationResponse) => void) | undefined;
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
    this.#state = "INITIAL";
    this.#onBeforeAutoRefresh = onBeforeAutoRefresh;
    this.#onRedirectCallback = onRedirectCallback;
    this.#onRefresh = onRefresh;
    this.#onRefreshFailure = onRefreshFailure;
    this.#refreshBufferInterval = refreshBufferInterval;
  }

  async initialize() {
    if (this.#state !== "INITIAL") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (isRedirectCallback(this.#redirectUri, searchParams)) {
      await this.#handleCallback();
    } else {
      try {
        await this.#refreshSession();
        this.#scheduleAutomaticRefresh();
      } catch {
        // this is expected to fail if a user doesn't
        // have a session. do nothing.
      }
    }
  }

  async signIn(opts: Omit<RedirectOptions, "type"> = {}) {
    return this.#redirect({ ...opts, type: "sign-in" });
  }

  async signUp(opts: Omit<RedirectOptions, "type"> = {}) {
    return this.#redirect({ ...opts, type: "sign-up" });
  }

  signOut(): void {
    const accessToken = memoryStorage.getItem(storageKeys.accessToken);
    if (typeof accessToken !== "string") return;
    const { sid: sessionId } = getClaims(accessToken);

    const url = this.#httpClient.getLogoutUrl(sessionId);

    if (url) {
      removeSessionData({ devMode: this.#devMode });
      window.location.assign(url);
    }
  }

  async getAccessToken(): Promise<string> {
    if (this.#shouldRefresh()) {
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
    if (this.#state !== "INITIAL") {
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const state = stateParam ? JSON.parse(stateParam) : undefined;
    this.#state = "AUTHENTICATING";

    // grab the previously stored code verifier from session storage
    const codeVerifier = window.sessionStorage.getItem(
      storageKeys.codeVerifier,
    );

    if (code) {
      if (codeVerifier) {
        try {
          const authenticationResponse =
            await this.#httpClient.authenticateWithCode({
              code,
              codeVerifier,
              useCookie: this.#useCookie,
            });

          if (authenticationResponse) {
            this.#state = "AUTHENTICATED";
            this.#scheduleAutomaticRefresh();
            setSessionData(authenticationResponse, { devMode: this.#devMode });
            this.#onRefresh && this.#onRefresh(authenticationResponse);
            this.#onRedirectCallback({ state, ...authenticationResponse });
          }
        } catch (error) {
          this.#state = "ERROR";
          console.error(error);
        }
      } else {
        this.#state = "ERROR";
        console.error(`Couldn't exchange code.

An authorization_code was supplied for a login which did not originate at the application. This could happen for various reasons:

* This could have been an attempted Login CSRF attack. You were not affected.
* The developer may not have configured a Login Initiation endpoint.
* Was this an Impersonation attempt? Impersonation support is coming soon.`);
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
            console.error(e);
          })
          .then(() => this.#scheduleAutomaticRefresh);
      } else {
        this.#scheduleAutomaticRefresh();
      }
    }, 1000);
  }

  async #refreshSession({ organizationId }: { organizationId?: string } = {}) {
    const beginningState = this.#state;
    this.#state = "AUTHENTICATING";

    try {
      await withLock(REFRESH_LOCK_NAME, async () => {
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

        this.#state = "AUTHENTICATED";
        setSessionData(authenticationResponse, { devMode: this.#devMode });
        this.#onRefresh && this.#onRefresh(authenticationResponse);
      });
    } catch (error) {
      if (
        error instanceof LockError &&
        error.name === "AcquisitionTimeoutError"
      ) {
        console.warn("Couldn't acquire refresh lock.");

        // preserving the original state so that we can try again next time
        this.#state = beginningState;

        return;
      }

      console.error(error);
      if (error instanceof RefreshError) {
        removeSessionData({ devMode: this.#devMode });
        // fire the refresh failure UNLESS this is the initial refresh attempt
        // (the initial refresh is expected to fail if a user has not logged in
        // ever or recently)
        beginningState !== "INITIAL" &&
          this.#onRefreshFailure &&
          this.#onRefreshFailure({ signIn: this.signIn.bind(this) });
      }
      // TODO: if a lock couldn't be acquired... that's not a fatal error.
      // maybe that's another state?
      this.#state = "ERROR";
      throw error;
    }
  }

  #shouldRefresh() {
    switch (this.#state) {
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

  async #redirect({
    context,
    invitationToken,
    loginHint,
    organizationId,
    passwordResetToken,
    state,
    type,
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
      screenHint: type,
      state: state ? JSON.stringify(state) : undefined,
    });

    window.location.assign(url);
  }

  #getAccessToken() {
    return memoryStorage.getItem(storageKeys.accessToken) as string | undefined;
  }

  get #useCookie() {
    return !this.#devMode;
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
