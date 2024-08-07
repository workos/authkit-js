import { AuthenticationResponse } from "../interfaces";
import { memoryStorage } from "./memory-storage";
import { storageKeys } from "./storage-keys";

interface AccessToken {
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  sid: string;
  sub: string;
  org_id?: string;
  role?: string;
  permissions?: string[];
}

// should replace this with jose if we ever need to verify the JWT
export function getClaims(accessToken: string) {
  return JSON.parse(atob(accessToken.split(".")[1])) as AccessToken;
}

export function setSessionData(
  data: AuthenticationResponse,
  { devMode = false } = {},
) {
  const { user, accessToken, refreshToken } = data;
  memoryStorage.setItem(storageKeys.user, user);
  memoryStorage.setItem(storageKeys.accessToken, accessToken);
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
