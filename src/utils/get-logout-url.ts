import { memoryStorage } from "./memory-storage";
import { storageKeys } from "./storage-keys";
import { getClaims } from "./session-data";

export function getLogoutUrl(baseUrl: string) {
  const accessToken = memoryStorage.getItem(storageKeys.accessToken);
  if (typeof accessToken !== "string") return null;

  const { sid: sessionId } = getClaims(accessToken);
  return `${baseUrl}/user_management/sessions/logout?session_id=${sessionId}`;
}
