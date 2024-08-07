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
import { getRefreshToken } from "./utils/session-data";
import { RedirectParams } from "./interfaces/create-client-options.interface";
import Lock from "./vendor/browser-tabs-lock";
import { RefreshError } from "./utils/authenticate-with-refresh-token";

interface RedirectOptions {
  type: "sign-in" | "sign-up";
  state?: any;
  invitationToken?: string;
}

type State = "INITIAL" | "AUTHENTICATING" | "AUTHENTICATED" | "ERROR";

const DEFAULT_HOSTNAME = "api.workos.com";

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
      return true;
    },
    onRedirectCallback = (_: RedirectParams) => {},
    onRefresh: _onRefresh,
  } = options;

  const _clientId = clientId;
  const _redirectUri = redirectUri;
  const _baseUrl = `${https ? "https" : "http"}://${apiHostname}${
    port ? `:${port}` : ""
  }`;
  const _useCookie = !devMode;
  let _authkitClientState: State = "INITIAL";

  const _needsRefresh = () => {
    if (_authkitClientState === "AUTHENTICATED") {
      const accessToken = memoryStorage.getItem(storageKeys.accessToken) as
        | string
        | undefined;
      const expiresAt = memoryStorage.getItem(storageKeys.expiresAt) as
        | number
        | undefined;

      if (!accessToken || !expiresAt) {
        return true;
      }

      // TODO: is this configurable?
      const LEEWAY = 10 * 1000; // 10 seconds
      return expiresAt < Date.now() - LEEWAY;
    }
    return false;
  };

  async function signIn(opts: Omit<RedirectOptions, "type"> = {}) {
    return _redirect({ ...opts, type: "sign-in" });
  }

  async function signUp(opts: Omit<RedirectOptions, "type"> = {}) {
    return _redirect({ ...opts, type: "sign-up" });
  }

  async function _redirect({ type, state, invitationToken }: RedirectOptions) {
    const { codeVerifier, codeChallenge } = await createPkceChallenge();
    // store the code verifier in session storage for later use (after the redirect back from authkit)
    window.sessionStorage.setItem(storageKeys.codeVerifier, codeVerifier);
    const url = getAuthorizationUrl(_baseUrl, {
      clientId: _clientId,
      redirectUri: _redirectUri,
      screenHint: type,
      codeChallenge,
      codeChallengeMethod: "S256",
      invitationToken,
      state: state ? JSON.stringify(state) : undefined,
    });

    window.location.assign(url);
  }

  function getUser() {
    const user = memoryStorage.getItem(storageKeys.user);
    return user ? (user as User) : null;
  }

  async function getAccessToken() {
    // TODO: should this respect onBeforeAutoRefresh ?
    if (_needsRefresh()) {
      await refreshSession();
    }
    return memoryStorage.getItem(storageKeys.accessToken) as string | undefined;
  }

  let _refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const _scheduleAutomaticRefresh = () => {
    _refreshTimer = setTimeout(() => {
      if (_needsRefresh() && onBeforeAutoRefresh()) {
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
      // TODO: if  this succeeds kick off the auto refresh timer?
      try {
        await refreshSession();
        _scheduleAutomaticRefresh();
      } catch (error) {
        console.log("error refreshing...", error);
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
            setSessionData(authenticationResponse, { devMode });
            onRedirectCallback({ state, ...authenticationResponse });
          }
        } catch (error) {
          _authkitClientState = "ERROR";
          console.error(error);
        }
      } else {
        _authkitClientState = "ERROR";
        console.error("Received code but missing codeVerifier");
      }
    }

    // Remove code from search params
    const cleanUrl = new URL(window.location.toString());
    cleanUrl.search = "";
    window.sessionStorage.removeItem(storageKeys.codeVerifier);
    window.history.replaceState({}, "", cleanUrl);
  }

  const REFRESH_LOCK = "WORKOS_REFRESH_SESSION";

  async function refreshSession() {
    if (
      _authkitClientState !== "AUTHENTICATED" &&
      _authkitClientState !== "INITIAL"
    ) {
      return;
    }

    const lock = new Lock();
    try {
      _authkitClientState = "AUTHENTICATING";
      if (await lock.acquireLock(REFRESH_LOCK)) {
        const authenticationResponse = await authenticateWithRefreshToken({
          baseUrl: _baseUrl,
          clientId: _clientId,
          refreshToken: getRefreshToken({ devMode }),
          useCookie: _useCookie,
        });

        if (authenticationResponse) {
          _authkitClientState = "AUTHENTICATED";
          setSessionData(authenticationResponse, { devMode });
          _onRefresh && _onRefresh(authenticationResponse);
        }
      }
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof RefreshError) {
        // TODO: fire a session ended callback?
        removeSessionData({ devMode });
      }
      // TODO: if a lock couldn't be acquired... that's not a fatal error.
      // maybe that's another state?
      _authkitClientState = "ERROR";
      throw error;
    } finally {
      await lock.releaseLock(REFRESH_LOCK);
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
    refreshSession,
    signOut,
  };
}
