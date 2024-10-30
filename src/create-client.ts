import { CreateClientOptions, User } from "./interfaces";
import { NoClientIdProvidedException } from "./exceptions";
import {
  authenticateWithCode,
  authenticateWithRefreshToken,
  getAuthorizationUrl,
  getLogoutUrl,
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

interface RedirectOptions {
  type: "sign-in" | "sign-up";
  state?: any;
  invitationToken?: string;
  passwordResetToken?: string;
  context?: string;
}

type State = "INITIAL" | "AUTHENTICATING" | "AUTHENTICATED" | "ERROR";

const DEFAULT_HOSTNAME = "api.workos.com";

const ORGANIZATION_ID_SESSION_STORAGE_KEY = "workos_organization_id";

export async function createClient(
  clientId: string,
  options: CreateClientOptions = {},
) {
  if (!clientId) {
    throw new NoClientIdProvidedException();
  }

  const {
    apiHostname = DEFAULT_HOSTNAME,
    https = true,
    port,
    redirectUri = window.origin,
    devMode = location.hostname === "localhost" ||
      location.hostname === "127.0.0.1",
    // refresh if this is true
    onBeforeAutoRefresh = () => {
      return !document.hidden;
    },
    onRedirectCallback = (_: RedirectParams) => {},
    onRefresh: _onRefresh,
    onRefreshFailure: _onRefreshFailure,
    refreshBufferInterval = 10,
  } = options;

  const _clientId = clientId;
  const _redirectUri = redirectUri;
  const _baseUrl = `${https ? "https" : "http"}://${apiHostname}${
    port ? `:${port}` : ""
  }`;
  const _useCookie = !devMode;
  let _authkitClientState: State = "INITIAL";

  const _shouldRefresh = () => {
    switch (_authkitClientState) {
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

        const tokenRefreshBufferInSeconds = refreshBufferInterval * 1000;
        const refreshTime = expiresAt - tokenRefreshBufferInSeconds;
        return refreshTime < Date.now();
    }
  };

  async function signIn(opts: Omit<RedirectOptions, "type"> = {}) {
    return _redirect({ ...opts, type: "sign-in" });
  }

  async function signUp(opts: Omit<RedirectOptions, "type"> = {}) {
    return _redirect({ ...opts, type: "sign-up" });
  }

  async function _redirect({
    type,
    state,
    context,
    invitationToken,
    passwordResetToken,
  }: RedirectOptions) {
    const { codeVerifier, codeChallenge } = await createPkceChallenge();
    // store the code verifier in session storage for later use (after the redirect back from authkit)
    window.sessionStorage.setItem(storageKeys.codeVerifier, codeVerifier);
    const url = getAuthorizationUrl(_baseUrl, {
      clientId: _clientId,
      redirectUri: _redirectUri,
      screenHint: type,
      context,
      codeChallenge,
      codeChallengeMethod: "S256",
      invitationToken,
      passwordResetToken,
      state: state ? JSON.stringify(state) : undefined,
    });

    window.location.assign(url);
  }

  function getUser() {
    const user = memoryStorage.getItem(storageKeys.user);
    return user ? (user as User) : null;
  }

  function _getAccessToken() {
    return memoryStorage.getItem(storageKeys.accessToken) as string | undefined;
  }

  async function getAccessToken(): Promise<string> {
    if (_shouldRefresh()) {
      try {
        await refreshSession();
      } catch (err) {
        if (err instanceof RefreshError) {
          throw new LoginRequiredError();
        } else {
          throw err;
        }
      }
    }

    const accessToken = _getAccessToken();
    if (!accessToken) {
      throw new LoginRequiredError();
    }

    return accessToken;
  }

  let _refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const _scheduleAutomaticRefresh = () => {
    _refreshTimer = setTimeout(() => {
      if (_shouldRefresh() && onBeforeAutoRefresh()) {
        refreshSession()
          .catch((e) => {
            console.error(e);
          })
          .then(_scheduleAutomaticRefresh);
      } else {
        _scheduleAutomaticRefresh();
      }
    }, 1000);
  };

  async function _initialize() {
    if (_authkitClientState !== "INITIAL") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (isRedirectCallback(redirectUri, searchParams)) {
      await _handleCallback();
    } else {
      try {
        await refreshSession();
        _scheduleAutomaticRefresh();
      } catch {
        // this is expected to fail if a user doesn't
        // have a session. do nothing.
      }
    }
  }

  async function _handleCallback() {
    if (_authkitClientState !== "INITIAL") {
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const state = stateParam ? JSON.parse(stateParam) : undefined;
    _authkitClientState = "AUTHENTICATING";

    // grab the previously stored code verifier from session storage
    const codeVerifier = window.sessionStorage.getItem(
      storageKeys.codeVerifier,
    );

    if (code) {
      if (codeVerifier) {
        try {
          const authenticationResponse = await authenticateWithCode({
            baseUrl: _baseUrl,
            clientId: _clientId,
            code,
            codeVerifier,
            useCookie: _useCookie,
          });

          if (authenticationResponse) {
            _authkitClientState = "AUTHENTICATED";
            _scheduleAutomaticRefresh();
            setSessionData(authenticationResponse, { devMode });
            _onRefresh && _onRefresh(authenticationResponse);
            onRedirectCallback({ state, ...authenticationResponse });
          }
        } catch (error) {
          _authkitClientState = "ERROR";
          console.error(error);
        }
      } else {
        _authkitClientState = "ERROR";
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

  const REFRESH_LOCK = "WORKOS_REFRESH_SESSION";

  async function refreshSession({
    organizationId,
  }: { organizationId?: string } = {}) {
    const beginningState = _authkitClientState;
    _authkitClientState = "AUTHENTICATING";

    try {
      await withLock(REFRESH_LOCK, async () => {
        if (organizationId) {
          sessionStorage.setItem(
            ORGANIZATION_ID_SESSION_STORAGE_KEY,
            organizationId,
          );
        } else {
          const accessToken = _getAccessToken();
          if (accessToken) {
            organizationId = getClaims(accessToken)?.org_id;
          } else {
            organizationId =
              sessionStorage.getItem(ORGANIZATION_ID_SESSION_STORAGE_KEY) ??
              undefined;
          }
        }

        const authenticationResponse = await authenticateWithRefreshToken({
          baseUrl: _baseUrl,
          clientId: _clientId,
          refreshToken: getRefreshToken({ devMode }),
          organizationId,
          useCookie: _useCookie,
        });

        _authkitClientState = "AUTHENTICATED";
        setSessionData(authenticationResponse, { devMode });
        _onRefresh && _onRefresh(authenticationResponse);
      });
    } catch (error) {
      if (
        error instanceof LockError &&
        error.name === "AcquisitionTimeoutError"
      ) {
        console.warn("Couldn't acquire refresh lock.");

        // preserving the original state so that we can try again next time
        _authkitClientState = beginningState;

        return;
      }

      console.error(error);
      if (error instanceof RefreshError) {
        removeSessionData({ devMode });
        // fire the refresh failure UNLESS this is the initial refresh attempt
        // (the initial refresh is expected to fail if a user has not logged in
        // ever or recently)
        beginningState !== "INITIAL" &&
          _onRefreshFailure &&
          _onRefreshFailure({ signIn: signIn });
      }
      // TODO: if a lock couldn't be acquired... that's not a fatal error.
      // maybe that's another state?
      _authkitClientState = "ERROR";
      throw error;
    }
  }

  function signOut() {
    const url = getLogoutUrl(_baseUrl);
    if (url) {
      removeSessionData({ devMode });
      window.location.assign(url);
    }
  }

  // we wait for the client to be initialized (redirect callback or refresh token)
  await _initialize();

  return {
    signIn,
    signUp,
    getUser,
    getAccessToken,
    signOut,
  };
}
