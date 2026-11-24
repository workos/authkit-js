import { CodeExchangeError, RefreshError } from "./errors";
import { HttpClient } from "./http-client";
import nock from "nock";

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

  function mockBodyTimeout(status: number, bodyErrorName: string) {
    const timeoutError = new DOMException(
      "The operation timed out.",
      "TimeoutError",
    );
    const controller = new AbortController();
    jest.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const response = new Response(null, { status });
    jest.spyOn(response, "json").mockImplementation(async () => {
      controller.abort(timeoutError);
      // Body readers can surface AbortError instead of the signal's reason.
      throw bodyErrorName === "AbortError"
        ? new DOMException("The operation was aborted.", "AbortError")
        : timeoutError;
    });
    jest.spyOn(global, "fetch").mockResolvedValue(response);
    return timeoutError;
  }

  describe("authenticateWithRefreshToken", () => {
    const refresh = () =>
      httpClient.authenticateWithRefreshToken({
        refreshToken: "fake refresh token",
        useCookie: false,
      });

    it("throws a transient RefreshError when the fetch times out", async () => {
      const timeoutError = new DOMException(
        "The operation timed out.",
        "TimeoutError",
      );
      jest.spyOn(global, "fetch").mockRejectedValue(timeoutError);

      const error = await refresh().catch((error) => error);
      expect(error.constructor).toBe(RefreshError);
      expect(error.isTransient).toBe(true);
      expect(error.cause).toBe(timeoutError);
    });

    it.each([
      [200, "AbortError"],
      [401, "TimeoutError"],
    ])(
      "throws a transient RefreshError when the fetch times out reading a %i response body",
      async (status, bodyErrorName) => {
        const timeoutError = mockBodyTimeout(status, bodyErrorName);

        const error = await refresh().catch((error) => error);
        expect(error.constructor).toBe(RefreshError);
        expect(error.isTransient).toBe(true);
        expect(error.cause).toBe(timeoutError);
      },
    );

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

    it("only wraps fetch rejections when the fetch times out", async () => {
      const networkError = new TypeError("fetch failed");
      jest.spyOn(global, "fetch").mockRejectedValue(networkError);

      await expect(refresh()).rejects.toBe(networkError);
    });
  });

  describe("authenticateWithCode", () => {
    const exchangeCode = () =>
      httpClient.authenticateWithCode({
        code: "fake authorization code",
        codeVerifier: "fake code verifier",
        useCookie: false,
      });

    it("throws a CodeExchangeError when the fetch times out", async () => {
      const timeoutError = new DOMException(
        "The operation timed out.",
        "TimeoutError",
      );
      jest.spyOn(global, "fetch").mockRejectedValue(timeoutError);

      const error = await exchangeCode().catch((error) => error);
      expect(error).toBeInstanceOf(CodeExchangeError);
      expect(error.cause).toBe(timeoutError);
    });

    it.each([
      [200, "TimeoutError"],
      [400, "AbortError"],
    ])(
      "throws a CodeExchangeError when the fetch times out reading a %i response body",
      async (status, bodyErrorName) => {
        const timeoutError = mockBodyTimeout(status, bodyErrorName);

        const error = await exchangeCode().catch((error) => error);
        expect(error).toBeInstanceOf(CodeExchangeError);
        expect(error.cause).toBe(timeoutError);
      },
    );
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
