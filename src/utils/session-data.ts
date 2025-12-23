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
  const { user, accessToken, refreshToken, authenticationMethod } = data;
  memoryStorage.setItem(storageKeys.user, user);
  memoryStorage.setItem(storageKeys.accessToken, accessToken);
  memoryStorage.setItem(storageKeys.authenticationMethod, authenticationMethod);
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
  memoryStorage.removeItem(storageKeys.authenticationMethod);
  (devMode ? window.localStorage : memoryStorage).removeItem(
    storageKeys.refreshToken,
  );
}

export function getRefreshToken({ devMode = false } = {}) {
  return (devMode ? window.localStorage : memoryStorage).getItem(
    storageKeys.refreshToken,
  ) as string | undefined;
}
