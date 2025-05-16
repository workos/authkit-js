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

  describe("when using redirect URIs in hybrid mobile app (e.g. Capacitor)", () => {
    /**
     * These tests ensure the function works for hybrid apps built with Capacitor.
     * For Android, the app uses http://localhost/callback as the current URL.
     * For iOS, the app uses capacitor://localhost/callback as the current URL.
     * See https://ionicframework.com/docs/troubleshooting/cors
     * The redirectUri remains https://example.com/callback. 
     * In the mobile app context, and the redirectUri is deep linked towards the app.
     */
    it("returns true when current location is http://localhost/callback and redirectUri is https://example.com/callback (Android)", () => {
      const originalLocation = window.location;
      const androidLocation = new URL('http://localhost/callback');

      delete (window as any).location;
      Object.defineProperty(window, 'location', {
        value: androidLocation,
        writable: true,
        configurable: true
      });
      
      const redirectUri = "https://example.com/callback";
      const searchParams = new URLSearchParams(Object.entries({ code: "123" }));

      const result = isRedirectCallback(redirectUri, searchParams);
      
      delete (window as any).location;
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true
      });

      expect(result).toBe(true);
    });

    it("returns true when current location is capacitor://localhost/callback and redirectUri is https://example.com/callback (iOS)", () => {
      const originalLocation = window.location;
      const iOSLocation = new URL('capacitor://localhost/callback');
      
      delete (window as any).location;
      Object.defineProperty(window, 'location', {
        value: iOSLocation,
        writable: true,
        configurable: true
      });

      const redirectUri = "https://example.com/callback";
      const searchParams = new URLSearchParams(Object.entries({ code: "123" }));

      const result = isRedirectCallback(redirectUri, searchParams);
      
      delete (window as any).location;
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true
      });

      expect(result).toBe(true);
    });
  });
});
