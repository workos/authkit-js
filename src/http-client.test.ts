import { HttpClient } from "./http-client";

describe("HttpClient", () => {
  let httpClient: HttpClient;

  beforeEach(() => {
    httpClient = new HttpClient({
      clientId: "123",
    });
  });

  describe("getAuthorizationUrl", () => {
    it("returns an authorization URL with the given `baseUrl`", () => {
      expect(httpClient.getAuthorizationUrl({ provider: "authkit" })).toBe(
        "https://api.workos.com/user_management/authorize?client_id=123&provider=authkit&response_type=code",
      );
    });

    describe("when no `provider`, `connectionId`, or `organizationId` is provided", () => {
      it("throws a TypeError", () => {
        expect(() => httpClient.getAuthorizationUrl({ provider: "" })).toThrow(
          "Incomplete arguments. Need to specify either a 'connectionId', 'organizationId', or 'provider'.",
        );
      });
    });

    describe("when `screenHint` is provided with a non-`authkit` provider", () => {
      it("throws a TypeError", () => {
        expect(() =>
          httpClient.getAuthorizationUrl({
            provider: "google",
            screenHint: "sign-in",
          }),
        ).toThrow("'screenHint' is only supported for 'authkit' provider");
      });
    });
  });

  describe("getLogoutUrl", () => {
    it("returns the logout URL with the given `baseUrl`", () => {
      expect(httpClient.getLogoutUrl("123").toString()).toBe(
        "https://api.workos.com/user_management/sessions/logout?session_id=123",
      );
    });
  });
});
