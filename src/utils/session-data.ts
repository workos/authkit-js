import { AuthenticationResponse, JWTPayload } from "../interfaces";
import { decodeJwt } from "./jwt";
import { memoryStorage } from "./memory-storage";
import { storageKeys } from "./storage-keys";

/**
 * Retrieves the claims from a JWT access token.
 * @param accessToken - The JWT access token to decode.
 * @returns The decoded JWT payload, which includes the claims.
 */
export function getClaims<T = {}>(accessToken: string): JWTPayload & T {
  return decodeJwt<T>(accessToken).payload;
}

export function setSessionData(
  data: AuthenticationResponse,
  { devMode = false } = {},
) {
  const { user, accessToken, refreshToken } = data;
  memoryStorage.setItem(storageKeys.user, user);
  const currentAccessToken = memoryStorage.getItem(storageKeys.accessToken);
  if (currentAccessToken !== accessToken) {
    globalThis.dispatchEvent(
      new CustomEvent("authkit:tokenchange", {
        detail: { accessToken },
      }),
    );
    memoryStorage.setItem(storageKeys.accessToken, accessToken);
  }
  (devMode ? window.localStorage : memoryStorage).setItem(
    storageKeys.refreshToken,
    refreshToken,
  );

  // compute a local time version of expires at (should avoid issues with slightly-wrong clocks)
  const { exp, iat } = getClaims(accessToken);
  const expiresIn = exp - iat;
  const expiresAt = Date.now() + expiresIn * 1000;
  memoryStorage.setItem(storageKeys.expiresAt, expiresAt);
}

export function removeSessionData({ devMode = false } = {}) {
  memoryStorage.removeItem(storageKeys.user);
  memoryStorage.removeItem(storageKeys.accessToken);
  (devMode ? window.localStorage : memoryStorage).removeItem(
    storageKeys.refreshToken,
  );
}

export function getRefreshToken({ devMode = false } = {}) {
  return (devMode ? window.localStorage : memoryStorage).getItem(
    storageKeys.refreshToken,
  ) as string | undefined;
}

interface CustomEventMap {
  "authkit:tokenchange": CustomEvent<{ accessToken: string }>;
}

declare global {
  interface Window {
    addEventListener<K extends keyof CustomEventMap>(
      type: K,
      listener: (this: Document, ev: CustomEventMap[K]) => void,
    ): void;
    dispatchEvent<K extends keyof CustomEventMap>(ev: CustomEventMap[K]): void;
  }
}
