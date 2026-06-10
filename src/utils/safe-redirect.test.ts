import { isSafeRedirectUrl } from "./safe-redirect";

describe("isSafeRedirectUrl", () => {
  const origin = "https://example.com";

  it("allows absolute https URLs", () => {
    expect(isSafeRedirectUrl("https://example.com/logged-out", origin)).toBe(
      true,
    );
  });

  it("allows absolute http URLs", () => {
    expect(isSafeRedirectUrl("http://example.com/logged-out", origin)).toBe(
      true,
    );
  });

  it("allows cross-origin https URLs (logout may leave the app)", () => {
    expect(isSafeRedirectUrl("https://marketing.example/bye", origin)).toBe(
      true,
    );
  });

  it("allows relative paths", () => {
    expect(isSafeRedirectUrl("/logged-out", origin)).toBe(true);
  });

  it("allows protocol-relative URLs (resolve to http(s))", () => {
    expect(isSafeRedirectUrl("//example.com/bye", origin)).toBe(true);
  });

  it("rejects javascript: URIs", () => {
    expect(isSafeRedirectUrl("javascript:alert(1)", origin)).toBe(false);
  });

  it("rejects javascript: URIs regardless of case", () => {
    expect(isSafeRedirectUrl("JavaScript:alert(1)", origin)).toBe(false);
  });

  it("rejects javascript: URIs with embedded control characters", () => {
    expect(isSafeRedirectUrl("java\tscript:alert(1)", origin)).toBe(false);
  });

  it("rejects data: URIs", () => {
    expect(
      isSafeRedirectUrl("data:text/html,<script>alert(1)</script>", origin),
    ).toBe(false);
  });

  it("rejects vbscript: URIs", () => {
    expect(isSafeRedirectUrl("vbscript:msgbox(1)", origin)).toBe(false);
  });

  it("treats an empty string as the same-origin root", () => {
    expect(isSafeRedirectUrl("", origin)).toBe(true);
  });

  it("rejects when the base origin is itself unparseable", () => {
    expect(isSafeRedirectUrl("/logged-out", "not a url")).toBe(false);
  });
});
