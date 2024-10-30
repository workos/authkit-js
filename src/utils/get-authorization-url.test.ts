import { getAuthorizationUrl } from "./get-authorization-url";

describe("getAuthorizationUrl", () => {
  it("returns an authorization URL with the given `baseUrl`", () => {
    expect(
      getAuthorizationUrl("https://api.workos.com", {
        provider: "authkit",
        clientId: "123",
      }),
    ).toBe(
      "https://api.workos.com/user_management/authorize?client_id=123&provider=authkit&response_type=code",
    );
  });

  describe("when no `provider`, `connectionId`, or `organizationId` is provided", () => {
    it("throws a TypeError", () => {
      expect(() =>
        getAuthorizationUrl("https://api.workos.com", {
          provider: "",
          clientId: "123",
        }),
      ).toThrow(
        "Incomplete arguments. Need to specify either a 'connectionId', 'organizationId', or 'provider'.",
      );
    });
  });

  describe("when `screenHint` is provided with a non-`authkit` provider", () => {
    it("throws a TypeError", () => {
      expect(() =>
        getAuthorizationUrl("https://api.workos.com", {
          provider: "google",
          clientId: "123",
          screenHint: "sign-in",
        }),
      ).toThrow("'screenHint' is only supported for 'authkit' provider");
    });
  });
});
