import { RefreshError } from "./errors";
import { HttpClient } from "./http-client";
import nock from "nock";

// A fetch that never settles unless aborted, as on a stale connection.
const hungFetch = (_url: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

const isPending = (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => false), Promise.resolve().then(() => true)]);

describe("HttpClient", () => {
  let httpClient: HttpClient;

  beforeEach(() => {
    httpClient = new HttpClient({
      clientId: "123",
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("authenticateWithRefreshToken", () => {
    const refresh = () =>
      httpClient.authenticateWithRefreshToken({
        refreshToken: "refresh_token",
        useCookie: false,
      });

    it.each([
      ["a rate limit", 429, "too_many_requests"],
      ["a server error", 500, "server_error"],
      ["a bad gateway", 502, undefined],
      ["a service unavailable", 503, undefined],
      ["a gateway timeout", 504, undefined],
      ["a request timeout", 408, undefined],
    ])(
      "throws a transient RefreshError for %s (%i)",
      async (_label, status, errorCode) => {
        nock("https://api.workos.com")
          .post("/user_management/authenticate")
          .reply(status, {
            ...(errorCode && { error: errorCode }),
            error_description: "Could not process refresh token.",
          });

        await expect(refresh()).rejects.toMatchObject({
          name: "RefreshError",
          status,
          isTransient: true,
        });
      },
    );

    it("throws a transient RefreshError when a 5xx has a non-JSON body", async () => {
      nock("https://api.workos.com")
        .post("/user_management/authenticate")
        .reply(503, "<html>Service Unavailable</html>", {
          "content-type": "text/html",
        });

      await expect(refresh()).rejects.toMatchObject({
        name: "RefreshError",
        status: 503,
        isTransient: true,
      });
    });

    it("throws a terminal RefreshError for a 400 invalid_grant", async () => {
      nock("https://api.workos.com")
        .post("/user_management/authenticate")
        .reply(400, {
          error: "invalid_grant",
          error_description: "Session has already ended.",
        });

      await expect(refresh()).rejects.toMatchObject({
        name: "RefreshError",
        status: 400,
        error: "invalid_grant",
        isTransient: false,
      });
    });

    it("throws a terminal RefreshError for a 401", async () => {
      nock("https://api.workos.com")
        .post("/user_management/authenticate")
        .reply(401, {});

      const error = await refresh().catch((e) => e);
      expect(error).toBeInstanceOf(RefreshError);
      expect(error.isTransient).toBe(false);
    });

    it("does not wrap a network failure in a RefreshError", async () => {
      nock("https://api.workos.com")
        .post("/user_management/authenticate")
        .replyWithError(new TypeError("fetch failed"));

      // A raw fetch failure propagates unchanged; create-client treats a
      // non-RefreshError as transient and preserves the session.
      const error = await refresh().catch((e) => e);
      expect(error).not.toBeInstanceOf(RefreshError);
    });

    describe("when the request does not settle", () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it("aborts a request that never responds after 8 seconds", async () => {
        jest.spyOn(global, "fetch").mockImplementation(hungFetch);

        const pending = refresh().catch((e) => e);
        await jest.advanceTimersByTimeAsync(7_999);
        expect(await isPending(pending)).toBe(true);

        await jest.advanceTimersByTimeAsync(1);
        const error = await pending;
        // An abort is not a RefreshError, so create-client treats it as
        // transient and preserves the session.
        expect(error.name).toBe("AbortError");
        expect(error).not.toBeInstanceOf(RefreshError);
      });

      it("aborts a request whose body never finishes", async () => {
        // Headers arrive but the body never does. As in browsers, aborting the
        // request errors the in-progress body read.
        jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
          const body = new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(init.signal!.reason),
              );
            },
          });
          return new Response(body, { status: 200 });
        });

        const pending = refresh().catch((e) => e);
        await jest.advanceTimersByTimeAsync(8_000);
        expect((await pending).name).toBe("AbortError");
      });
    });
  });

  describe("authenticateWithCode", () => {
    it("aborts a request that never responds after 8 seconds", async () => {
      jest.useFakeTimers();
      try {
        jest.spyOn(global, "fetch").mockImplementation(hungFetch);

        const pending = httpClient
          .authenticateWithCode({
            code: "code",
            codeVerifier: "verifier",
            useCookie: false,
          })
          .catch((e) => e);
        await jest.advanceTimersByTimeAsync(8_000);
        expect((await pending).name).toBe("AbortError");
      } finally {
        jest.useRealTimers();
      }
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
      expect(
        httpClient
          .getLogoutUrl({ sessionId: "session_123abc", returnTo: undefined })
          .toString(),
      ).toBe(
        "https://api.workos.com/user_management/sessions/logout?session_id=session_123abc",
      );
    });

    describe("when `returnTo` is provided", () => {
      it("includes the `returnTo` query parameter", () => {
        expect(
          httpClient
            .getLogoutUrl({
              sessionId: "session_123abc",
              returnTo: "https://example.com",
            })
            .toString(),
        ).toBe(
          "https://api.workos.com/user_management/sessions/logout?session_id=session_123abc&return_to=https%3A%2F%2Fexample.com",
        );
      });
    });
  });
});
