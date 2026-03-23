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

function refreshTokenKey(clientId: string) {
  return `${storageKeys.refreshToken}:${clientId}`;
}

export function setSessionData(
  data: AuthenticationResponse,
  { devMode = false, clientId }: { devMode?: boolean; clientId: string },
) {
  const { user, accessToken, refreshToken, authenticationMethod } = data;
  memoryStorage.setItem(storageKeys.user, user);
  memoryStorage.setItem(storageKeys.accessToken, accessToken);
  memoryStorage.setItem(storageKeys.authenticationMethod, authenticationMethod);
  const storage = devMode ? window.localStorage : memoryStorage;
  storage.setItem(refreshTokenKey(clientId), refreshToken);

  // compute a local time version of expires at (should avoid issues with slightly-wrong clocks)
  const { exp, iat } = getClaims(accessToken);
  const expiresIn = exp - iat;
  const expiresAt = Date.now() + expiresIn * 1000;
  memoryStorage.setItem(storageKeys.expiresAt, expiresAt);
}

export function removeSessionData({
  devMode = false,
  clientId,
}: {
  devMode?: boolean;
  clientId: string;
}) {
  memoryStorage.removeItem(storageKeys.user);
  memoryStorage.removeItem(storageKeys.accessToken);
  memoryStorage.removeItem(storageKeys.authenticationMethod);
  const storage = devMode ? window.localStorage : memoryStorage;
  storage.removeItem(refreshTokenKey(clientId));
  // Remove legacy key
  storage.removeItem(storageKeys.refreshToken);
}

export function getRefreshToken({
  devMode = false,
  clientId,
}: {
  devMode?: boolean;
  clientId: string;
}): string | undefined {
  const storage = devMode ? window.localStorage : memoryStorage;
  // Fall back to legacy key for backwards compat
  const token =
    storage.getItem(refreshTokenKey(clientId)) ??
    storage.getItem(storageKeys.refreshToken);
  return typeof token === "string" ? token : undefined;
}
