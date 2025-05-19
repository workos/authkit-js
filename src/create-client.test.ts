/**
 * @jest-environment-options {"url": "https://example.com/callback?code=code_123"}
 */

import {
  createClient,
  ORGANIZATION_ID_SESSION_STORAGE_KEY,
} from "./create-client";
import { LoginRequiredError, RefreshError } from "./errors";
import { mockLocation, restoreLocation } from "./testing/mock-location";
import { getClaims } from "./utils/session-data";
import { storageKeys } from "./utils/storage-keys";
import nock from "nock";

describe("create-client", () => {
  let client: Awaited<ReturnType<typeof createClient>>;
  let cookieMock: jest.SpyInstance;

  beforeEach(() => {
    sessionStorage.removeItem(storageKeys.codeVerifier);
    sessionStorage.removeItem(ORGANIZATION_ID_SESSION_STORAGE_KEY);
    localStorage.removeItem(storageKeys.refreshToken);

    // assume we have a session already for all these tests
    cookieMock = jest
      .spyOn(document, "cookie", "get")
      .mockReturnValue(`workos-has-session=1`);
  });

  afterEach(() => {
    client?.dispose();

    // Restore the original URL. JSDOM/Jest apparently doesn't do this between tests.
    history.replaceState(
      null,
      "",
      "https://example.com/callback?code=code_123",
    );

    nock.cleanAll();
  });

  interface MockAccessTokenClaims {
    iat?: number;
    exp?: number;
    sid?: string;
    jti?: string;
    org_id?: string;
  }

  const mockAccessToken = ({
    sid = "session_123abc",
    iat = Date.now() / 1000,
    exp = Date.now() / 1000 + 3600,
    jti,
  }: MockAccessTokenClaims = {}) =>
    "." + btoa(JSON.stringify({ sid, iat, exp, jti }));

  describe("createClient", () => {
    describe("with no `clientId` provided", () => {
      it("throws an error", async () => {
        await expect(createClient("")).rejects.toThrow(/Missing Client ID/);
      });
    });

    describe("when the current route has a `code`", () => {
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

    describe("when the current route does not have a `code`", () => {
      describe("when there is a `workos-has-session cookie", () => {
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
            devMode: false,
            redirectUri: "https://example.com/",
          });

          nockScope.done();
        });
      });

      describe("when devMode is true", () => {
        it("refreshes when a refresh token is available", async () => {
          localStorage.setItem(
            "workos:refresh-token",
            "this-is-a-refresh-token",
          );
          cookieMock.mockRestore();
          const nockScope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              client_id: "client_123abc",
              grant_type: "refresh_token",
              refresh_token: "this-is-a-refresh-token",
            })
            .reply(200, {
              user: {},
              access_token: mockAccessToken(),
              refresh_token: "refresh_token",
            });

          client = await createClient("client_123abc", {
            devMode: true,
            redirectUri: "https://example.com/",
          });

          nockScope.done();
        });

        it("does not refresh otherwise", async () => {
          cookieMock.mockRestore();
          const nockScope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              client_id: "client_123abc",
              grant_type: "refresh_token",
              refresh_token: "no-refresh-token-is-set",
            })
            .reply(200, {
              user: {},
              access_token: mockAccessToken(),
              refresh_token: "refresh_token",
            });

          client = await createClient("client_123abc", {
            devMode: true,
            redirectUri: "https://example.com/",
          });

          // verify no network requests were made
          expect(nockScope.isDone()).toBe(false);

          // client should still be created successfully
          expect(client).toBeDefined();
        });
      });

      describe("otherwise", () => {
        it("does nothing", async () => {
          cookieMock.mockRestore();
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
            devMode: false,
            redirectUri: "https://example.com/",
          });

          // verify no network requests were made
          expect(nockScope.isDone()).toBe(false);

          // client should still be created successfully
          expect(client).toBeDefined();
        });
      });
    });
  });

  describe("Client", () => {
    function nockRefresh({
      currentRefreshToken = "refresh_token",
      organizationId,
      accessTokenClaims = { org_id: organizationId },
      devMode = false,
    }: {
      currentRefreshToken?: string;
      organizationId?: string;
      accessTokenClaims?: MockAccessTokenClaims;
      devMode?: boolean;
    } = {}) {
      const scope = nock("https://api.workos.com")
        .post("/user_management/authenticate", {
          client_id: "client_123abc",
          grant_type: "refresh_token",
          refresh_token: devMode ? currentRefreshToken : undefined,
        })
        .reply(200, {
          user: { id: "user_123abc" },
          organization_id: organizationId,
          access_token: mockAccessToken(accessTokenClaims),
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

    describe("getSignInUrl", () => {
      beforeEach(() => {
        mockLocation();
      });

      afterEach(() => {
        restoreLocation();
      });

      it("generates a PKCE challenge and returns the AuthKit sign-in page URL", async () => {
        const { scope } = nockRefresh();
        expect(sessionStorage.getItem(storageKeys.codeVerifier)).toBeNull();

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });
        const signInUrl = await client.getSignInUrl();
        const url = new URL(signInUrl);

        // Location.assign should not be called
        expect(jest.mocked(location.assign)).not.toHaveBeenCalled();
        expect({
          url,
          searchParams: Object.fromEntries(url.searchParams.entries()),
        }).toEqual({
          url: expect.objectContaining({
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

    describe("getSignUpUrl", () => {
      beforeEach(() => {
        mockLocation();
      });

      afterEach(() => {
        restoreLocation();
      });

      it("generates a PKCE challenge and returns the AuthKit sign-up page URL", async () => {
        const { scope } = nockRefresh();
        expect(sessionStorage.getItem(storageKeys.codeVerifier)).toBeNull();

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
        });
        const signUpUrl = await client.getSignUpUrl();
        const url = new URL(signUpUrl);

        // Location.assign should not be called
        expect(jest.mocked(location.assign)).not.toHaveBeenCalled();
        expect({
          url,
          searchParams: Object.fromEntries(url.searchParams.entries()),
        }).toEqual({
          url: expect.objectContaining({
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

      describe("when the `returnTo` option is provided", () => {
        it("includes the `returnTo` query parameter", async () => {
          const { scope } = nockRefresh();

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
          });
          client.signOut({ returnTo: "https://example.com" });

          const newUrl = new URL(jest.mocked(location.assign).mock.calls[0][0]);
          expect({
            newUrl,
            searchParams: Object.fromEntries(newUrl.searchParams.entries()),
          }).toEqual({
            newUrl: expect.objectContaining({
              origin: "https://api.workos.com",
              pathname: "/user_management/sessions/logout",
            }),
            searchParams: {
              session_id: "session_123abc",
              return_to: "https://example.com",
            },
          });
          scope.done();
        });
      });

      describe("when the `noRedirect` option is provided", () => {
        it("makes a fetch request instead of redirecting", async () => {
          const { scope } = nockRefresh();

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
          });

          const originalFetch = global.fetch;
          const mockFetch = jest.fn().mockResolvedValue({
            ok: true,
          });
          global.fetch = mockFetch;

          try {
            await client.signOut({ noRedirect: true });

            // Location.assign should not be called
            expect(jest.mocked(location.assign)).not.toHaveBeenCalled();

            // Fetch should be called with the correct URL
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
            expect({
              fetchUrl,
              searchParams: Object.fromEntries(fetchUrl.searchParams.entries()),
            }).toEqual({
              fetchUrl: expect.objectContaining({
                origin: "https://api.workos.com",
                pathname: "/user_management/sessions/logout",
              }),
              searchParams: { session_id: "session_123abc" },
            });
            scope.done();
          } finally {
            global.fetch = originalFetch;
          }
        });

        it("includes the `returnTo` parameter", async () => {
          const { scope } = nockRefresh();

          client = await createClient("client_123abc", {
            redirectUri: "https://example.com/",
          });

          const originalFetch = global.fetch;
          const mockFetch = jest.fn().mockResolvedValue({
            ok: true,
          });
          global.fetch = mockFetch;

          try {
            await client.signOut({ returnTo: "https://example.com", noRedirect: true });

            // Location.assign should not be called
            expect(jest.mocked(location.assign)).not.toHaveBeenCalled();

            expect(mockFetch).toHaveBeenCalledTimes(1);

            const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
            expect({
              fetchUrl,
              searchParams: Object.fromEntries(fetchUrl.searchParams.entries()),
            }).toEqual({
              fetchUrl: expect.objectContaining({
                origin: "https://api.workos.com",
                pathname: "/user_management/sessions/logout",
              }),
              searchParams: {
                session_id: "session_123abc",
                return_to: "https://example.com",
              },
            });

            scope.done();
          } finally {
            global.fetch = originalFetch;
          }
        });
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

        describe("when `returnTo` is provided", () => {
          it("clears the tokens", async () => {
            localStorage.setItem(storageKeys.refreshToken, "refresh_token");
            const { scope } = nockRefresh({ devMode: true });

            client = await createClient("client_123abc", {
              redirectUri: "https://example.com/",
              devMode: true,
            });
            client.signOut({ returnTo: "https://example.com" });

            expect(localStorage.getItem(storageKeys.refreshToken)).toBeNull();
            scope.done();
          });
        });

        describe("when `noRedirect` is true", () => {
          it("clears the tokens", async () => {
            localStorage.setItem(storageKeys.refreshToken, "refresh_token");
            const { scope } = nockRefresh({ devMode: true });

            client = await createClient("client_123abc", {
              redirectUri: "https://example.com/",
              devMode: true,
            });

            const originalFetch = global.fetch;
            const mockFetch = jest.fn().mockResolvedValue({
              ok: true,
            });
            global.fetch = mockFetch;

            try {
              await client.signOut({ noRedirect: true });
              expect(localStorage.getItem(storageKeys.refreshToken)).toBeNull();
              scope.done();
            } finally {
              global.fetch = originalFetch;
            }
          });
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
          scope.done();
        });
      });
    });

    describe("onRefresh", () => {
      it("is called after a successful refresh", async () => {
        const { scope } = nockRefresh({ organizationId: "org_abc" });

        const onRefresh = jest.fn();

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com",
          onRefresh,
        });

        scope.done();

        expect(onRefresh).toHaveBeenCalledWith(
          expect.objectContaining({
            user: {
              id: "user_123abc",
            },
            organizationId: "org_abc",
            accessToken: expect.stringMatching(/^.eyJ/),
          }),
        );
      });

      it("does not include the refresh token", async () => {
        const { scope } = nockRefresh();

        const onRefresh = jest.fn();

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com",
          onRefresh,
        });

        scope.done();

        expect(onRefresh).toHaveBeenCalledWith(
          expect.objectContaining({
            accessToken: expect.stringMatching(/^.eyJ/),
          }),
        );
        expect(onRefresh).not.toHaveBeenCalledWith(
          expect.objectContaining({
            refreshToken: expect.stringContaining(""),
          }),
        );
      });
    });

    describe("getAccessToken", () => {
      const clientWithExpiredAccessToken = async () => {
        const now = Date.now();
        const { scope: initialRefreshScope } = nockRefresh({
          accessTokenClaims: {
            iat: now,
            // deliberately issuing a JWT that expires at the same time
            // as iat (we don't trust the client's clock, so back-dating
            // the timestamps doesn't do anything)
            exp: now,
            jti: "initial-access-token",
          },
        });

        client = await createClient("client_123abc", {
          redirectUri: "https://example.com/",
          // turning off auto refresh so we can ensure that we're
          // hitting the expired-access token case
          onBeforeAutoRefresh: () => false,
        });
        initialRefreshScope.done();

        return client;
      };

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
          const consoleDebugSpy = jest
            .spyOn(console, "debug")
            .mockImplementation();
          client = await clientWithExpiredAccessToken();

          const scope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              client_id: "client_123abc",
              grant_type: "refresh_token",
            })
            .reply(401, {});

          await expect(client.getAccessToken()).rejects.toThrow(
            LoginRequiredError,
          );
          scope.done();
        });
      });

      describe("when the current access token has expired", () => {
        it("gets a new access token and returns it", async () => {
          const client = await clientWithExpiredAccessToken();

          const { scope: refreshScope } = nockRefresh({
            accessTokenClaims: {
              jti: "refreshed-token",
            },
          });
          const accessToken = await client.getAccessToken();
          expect(getClaims(accessToken).jti).toEqual("refreshed-token");
          refreshScope.done();
        });

        it("only issues one request for multiple calls", async () => {
          const client = await clientWithExpiredAccessToken();

          const { scope: refreshScope } = nockRefresh({
            accessTokenClaims: {
              jti: "refreshed-token",
            },
          });

          const accessToken1 = client.getAccessToken().then((token) => {
            expect(getClaims(token).jti).toEqual("refreshed-token");
          });
          const accessToken2 = client.getAccessToken().then((token) => {
            expect(getClaims(token).jti).toEqual("refreshed-token");
          });
          const accessToken3 = client.getAccessToken().then((token) => {
            expect(getClaims(token).jti).toEqual("refreshed-token");
          });
          await Promise.all([accessToken1, accessToken2, accessToken3]);
          refreshScope.done();
        });

        it("throws an error if the refresh fails", async () => {
          const consoleDebugSpy = jest
            .spyOn(console, "debug")
            .mockImplementation();
          const client = await clientWithExpiredAccessToken();

          const scope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              client_id: "client_123abc",
              grant_type: "refresh_token",
            })
            .reply(400, {
              error: "invalid_grant",
              error_description: "Session has already ended.",
            });

          await expect(client.getAccessToken()).rejects.toThrow(
            LoginRequiredError,
          );
          expect(consoleDebugSpy.mock.calls).toEqual([
            [expect.any(RefreshError)],
          ]);

          scope.done();
        });

        it("throws an error if the fetch fails", async () => {
          const consoleDebugSpy = jest
            .spyOn(console, "debug")
            .mockImplementation();
          const client = await clientWithExpiredAccessToken();

          const errorScope = nock("https://api.workos.com")
            .post("/user_management/authenticate", {
              client_id: "client_123abc",
              grant_type: "refresh_token",
            })
            .times(2)
            .replyWithError(new TypeError("Network Error"));

          await expect(client.getAccessToken()).rejects.toThrow(TypeError);
          await expect(client.getAccessToken()).rejects.toThrow(TypeError);
          expect(consoleDebugSpy.mock.calls).toEqual([
            [expect.any(TypeError)],
            [expect.any(TypeError)],
          ]);
          errorScope.done();

          const { scope: successScope } = nockRefresh();
          const accessToken = await client.getAccessToken();
          expect(accessToken).toMatch(/^.eyJ/);
          successScope.done();
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
        jest.spyOn(console, "debug").mockImplementation();

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
