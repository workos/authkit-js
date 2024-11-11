/**
 * @jest-environment-options {"url": "https://example.com/callback?code=code_123"}
 */

import {
  createClient,
  ORGANIZATION_ID_SESSION_STORAGE_KEY,
} from "./create-client";
import { LoginRequiredError, RefreshError } from "./errors";
import { mockLocation, restoreLocation } from "./testing/mock-location";
import { storageKeys } from "./utils/storage-keys";
import nock from "nock";

describe("create-client", () => {
  let client: Awaited<ReturnType<typeof createClient>>;

  beforeEach(() => {
    sessionStorage.removeItem(storageKeys.codeVerifier);
    sessionStorage.removeItem(ORGANIZATION_ID_SESSION_STORAGE_KEY);
    localStorage.removeItem(storageKeys.refreshToken);
  });

  afterEach(() => {
    client?.dispose();

    // Restore the original URL. JSDOM/Jest apparently doesn't do this between tests.
    history.replaceState(
      null,
      "",
      "https://example.com/callback?code=code_123",
    );
  });

  const mockAccessToken = () =>
    "." +
    btoa(
      JSON.stringify({
        sid: "session_123abc",
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }),
    );

  describe("createClient", () => {
    describe("with no `clientId` provided", () => {
      it("throws an error", async () => {
        await expect(createClient("")).rejects.toThrow(/Missing Client ID/);
      });
    });

    describe("when the current route matches the redirect URI and has a `code`", () => {
      describe("when no `codeVerifier` is present in session storage", () => {
        it("logs an error", async () => {
          jest.spyOn(console, "error").mockImplementation();

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/callback",
          });

          expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining(
              "An authorization_code was supplied for a login which did not originate at the application.",
            ),
          );
        });
      });

      describe("when a `codeVerifier` is set", () => {
        it("exchanges the code for an access token and clears it from the URL", async () => {
          sessionStorage.setItem(storageKeys.codeVerifier, "code_verifier");
          const nockScope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              code: "code_123",
              client_id: "client_123abc",
              grant_type: "authorization_code",
              code_verifier: "code_verifier",
            })
            .reply(200, {
              user: {},
              access_token: mockAccessToken(),
              refresh_token: "refresh_token",
            });
          expect(location.search).toBe("?code=code_123");

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/callback",
          });

          expect(sessionStorage.getItem(storageKeys.codeVerifier)).toBeNull();
          expect(location.search).toBe("");
          nockScope.done();
        });
      });
    });

    describe("when the current route does not match the redirect URI", () => {
      it("refreshes the existing session", async () => {
        const nockScope = nock("https://api.workos.com")
          .post("/user_management/authenticate", {
            client_id: "client_123abc",
            grant_type: "refresh_token",
          })
          .reply(200, {
            user: {},
            access_token: mockAccessToken(),
            refresh_token: "refresh_token",
          });

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });

        nockScope.done();
      });
    });
  });

  describe("Client", () => {
    function nockRefresh({
      currentRefreshToken = "refresh_token",
      devMode = false,
    } = {}) {
      const scope = nock("https://api.workos.com")
        .post("/user_management/authenticate", {
          client_id: "client_123abc",
          grant_type: "refresh_token",
          refresh_token: devMode ? currentRefreshToken : undefined,
        })
        .reply(200, {
          user: { id: "user_123abc" },
          access_token: mockAccessToken(),
          refresh_token: "refresh_token",
        });

      return { scope };
    }

    describe("signIn", () => {
      beforeEach(() => {
        mockLocation();
      });

      afterEach(() => {
        restoreLocation();
      });

      it("generates a PKCE challenge and redirects to the AuthKit sign-in page", async () => {
        const { scope } = nockRefresh();
        expect(sessionStorage.getItem(storageKeys.codeVerifier)).toBeNull();

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });
        await client.signIn();

        const newUrl = new URL(jest.mocked(location.assign).mock.calls[0][0]);
        expect({
          newUrl,
          searchParams: Object.fromEntries(newUrl.searchParams.entries()),
        }).toEqual({
          newUrl: expect.objectContaining({
            origin: "https://api.workos.com",
            pathname: "/user_management/authorize",
          }),
          searchParams: {
            client_id: "client_123abc",
            code_challenge: expect.any(String),
            code_challenge_method: "S256",
            provider: "authkit",
            redirect_uri: "https://example.com/",
            response_type: "code",
            screen_hint: "sign-in",
          },
        });
        expect(sessionStorage.getItem(storageKeys.codeVerifier)).toBeDefined();
        scope.done();
      });
    });

    describe("signUp", () => {
      beforeEach(() => {
        mockLocation();
      });

      afterEach(() => {
        restoreLocation();
      });

      it("generates a PKCE challenge and redirects to the AuthKit sign-up page", async () => {
        const { scope } = nockRefresh();
        expect(sessionStorage.getItem(storageKeys.codeVerifier)).toBeNull();

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });
        await client.signUp();

        const newUrl = new URL(jest.mocked(location.assign).mock.calls[0][0]);
        expect({
          newUrl,
          searchParams: Object.fromEntries(newUrl.searchParams.entries()),
        }).toEqual({
          newUrl: expect.objectContaining({
            origin: "https://api.workos.com",
            pathname: "/user_management/authorize",
          }),
          searchParams: {
            client_id: "client_123abc",
            code_challenge: expect.any(String),
            code_challenge_method: "S256",
            provider: "authkit",
            redirect_uri: "https://example.com/",
            response_type: "code",
            screen_hint: "sign-up",
          },
        });
        expect(sessionStorage.getItem(storageKeys.codeVerifier)).toBeDefined();
        scope.done();
      });
    });

    describe("signOut", () => {
      beforeEach(() => {
        mockLocation();
      });

      afterEach(() => {
        restoreLocation();
      });

      it("redirects to the logout URL", async () => {
        const { scope } = nockRefresh();

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });
        client.signOut();

        const newUrl = new URL(jest.mocked(location.assign).mock.calls[0][0]);
        expect({
          newUrl,
          searchParams: Object.fromEntries(newUrl.searchParams.entries()),
        }).toEqual({
          newUrl: expect.objectContaining({
            origin: "https://api.workos.com",
            pathname: "/user_management/sessions/logout",
          }),
          searchParams: { session_id: "session_123abc" },
        });
        scope.done();
      });

      describe("when tokens are persisted in local storage in development", () => {
        it("clears the tokens", async () => {
          localStorage.setItem(storageKeys.refreshToken, "refresh_token");
          const { scope } = nockRefresh({ devMode: true });

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
            devMode: true,
          });
          client.signOut();

          expect(localStorage.getItem(storageKeys.refreshToken)).toBeNull();
          scope.done();
        });
      });
    });

    describe("getUser", () => {
      describe("when the current session is authenticated", () => {
        it("returns the user", async () => {
          const { scope } = nockRefresh();

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
          });
          const user = client.getUser();

          expect(user).toMatchObject({ id: "user_123abc" });
          scope.done();
        });
      });

      describe("when the current session is not authenticated", () => {
        it("returns `null`", async () => {
          const consoleErrorSpy = jest
            .spyOn(console, "error")
            .mockImplementation();
          const scope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              client_id: "client_123abc",
              grant_type: "refresh_token",
            })
            .reply(401, {});

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
          });
          const user = client.getUser();

          expect(user).toBeNull();
          expect(consoleErrorSpy.mock.calls).toEqual([
            [expect.any(RefreshError)],
          ]);
          scope.done();
        });
      });
    });

    describe("getAccessToken", () => {
      describe("when the current session is authenticated", () => {
        it("returns the access token", async () => {
          const { scope } = nockRefresh();

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
          });
          const accessToken = await client.getAccessToken();

          expect(accessToken).toEqual(expect.stringMatching(/\.eyJ/));
          scope.done();
        });
      });

      describe("when the current session is not authenticated", () => {
        it("throws a `LoginRequiredError`", async () => {
          const consoleErrorSpy = jest
            .spyOn(console, "error")
            .mockImplementation();
          const scope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              client_id: "client_123abc",
              grant_type: "refresh_token",
            })
            .reply(401, {});

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
          });
          await expect(client.getAccessToken()).rejects.toThrow(
            LoginRequiredError,
          );

          expect(consoleErrorSpy.mock.calls).toEqual([
            [expect.any(RefreshError)],
          ]);
          scope.done();
        });
      });
    });

    describe("switchToOrganization", () => {
      it("refreshes the session with the given organization ID", async () => {
        const { scope: createClientScope } = nockRefresh();
        const organizationId = "org_123abc";
        const switchToOrgScope = nock("https://api.workos.com")
          .post("/user_management/authenticate", {
            client_id: "client_123abc",
            grant_type: "refresh_token",
            organization_id: organizationId,
          })
          .reply(200, {
            user: {},
            access_token: mockAccessToken(),
            refresh_token: "refresh_token",
            organization_id: organizationId,
          });
        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });

        await client.switchToOrganization({ organizationId });
        createClientScope.done();
        switchToOrgScope.done();
      });

      it("redirects to the AuthKit sign-in page if the refresh fails", async () => {
        const { scope: createClientScope } = nockRefresh();
        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });
        createClientScope.done();

        const organizationId = "org_123abc";
        const switchToOrgScope = nock("https://api.workos.com")
          .post("/user_management/authenticate", {
            client_id: "client_123abc",
            grant_type: "refresh_token",
            organization_id: organizationId,
          })
          .reply(401, {});
        const signInSpy = jest.spyOn(client, "signIn").mockImplementation();
        jest.spyOn(console, "error").mockImplementation();

        await client.switchToOrganization({
          organizationId,
          signInOpts: { state: { returnTo: "/somewhere" } },
        });
        switchToOrgScope.done();

        expect(signInSpy).toHaveBeenCalledWith({
          organizationId: "org_123abc",
          state: { returnTo: "/somewhere" },
        });
      });
    });
  });
});
