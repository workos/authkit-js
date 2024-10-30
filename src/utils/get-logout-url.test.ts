import { memoryStorage } from "./memory-storage";
import { getLogoutUrl } from "./get-logout-url";
import { storageKeys } from "./storage-keys";

describe("getLogoutUrl", () => {
  describe("when no access token is present in storage", () => {
    it("returns null", () => {
      expect(getLogoutUrl("https://api.workos.com")).toBeNull();
    });
  });

  describe("when an access token is present in storage", () => {
    beforeEach(() => {
      memoryStorage.setItem(
        storageKeys.accessToken,
        // Faux-encoded JWT
        "." + btoa(JSON.stringify({ sid: "123" })),
      );
    });

    afterEach(() => {
      memoryStorage.removeItem(storageKeys.accessToken);
    });

    it("returns the logout URL with the given `baseUrl`", () => {
      expect(getLogoutUrl("https://api.workos.com")).toBe(
        "https://api.workos.com/user_management/sessions/logout?session_id=123",
      );
    });
  });
});
