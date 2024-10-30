import { createPkceChallenge } from "./pkce";

describe("pkce", () => {
  describe("createPkceChallenge", () => {
    it("returns a `codeVerifier` and `codeChallenge`", async () => {
      await expect(createPkceChallenge()).resolves.toMatchObject({
        codeVerifier: expect.any(String),
        codeChallenge: expect.any(String),
      });
    });

    it("returns a `codeChallenge` that is base64url encoded SHA256 hash of `codeVerifier`", async () => {
      const { codeVerifier, codeChallenge } = await createPkceChallenge();

      // Similar but independent implementation of `createCodeChallenge` as a sanity check
      // that these two values are indeed related.
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const hashed = await crypto.subtle.digest("SHA-256", data);
      const expected = btoa(
        Array.from(new Uint8Array(hashed), (b) => String.fromCharCode(b)).join(
          "",
        ),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      expect(codeChallenge).toBe(expected);
    });
  });
});
