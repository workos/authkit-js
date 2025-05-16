/**
 * @jest-environment-options {"url": "https://example.com/callback"}
 */

import { isRedirectCallback } from "./is-redirect-callback";

describe("isRedirectCallback", () => {
  it("returns true when the current URI matches the redirect URI", () => {
    const redirectUri = "https://example.com/callback";
    const searchParams = new URLSearchParams(Object.entries({ code: "123" }));

    const result = isRedirectCallback(redirectUri, searchParams);

    expect(result).toBe(true);
  });

  describe('when the given redirect URI ends with a "/"', () => {
    it("returns true when the current location otherwise matches without the slash", () => {
      const originalPath = window.location.pathname;
      window.history.replaceState({}, "", "/callback/");
      
      const redirectUri = "https://example.com/callback";
      const searchParams = new URLSearchParams(Object.entries({ code: "123" }));

      const result = isRedirectCallback(redirectUri, searchParams);

      window.history.replaceState({}, "", originalPath);

      expect(result).toBe(true);
    });
  });

  describe('when no "code" is present in the search params', () => {
    it("returns false", () => {
      const redirectUri = "https://example.com/callback";
      const searchParams = new URLSearchParams();

      const result = isRedirectCallback(redirectUri, searchParams);

      expect(result).toBe(false);
    });
  });

  describe("when the current URI does not match the redirect URI", () => {
    it("returns false", () => {
      const redirectUri = "https://example.com/other-callback";
      const searchParams = new URLSearchParams(Object.entries({ code: "123" }));

      const result = isRedirectCallback(redirectUri, searchParams);

      expect(result).toBe(false);
    });
  });
});
