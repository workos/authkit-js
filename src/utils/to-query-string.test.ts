import { toQueryString } from "./to-query-string";

describe("toQueryString", () => {
  describe("when given an empty object", () => {
    it("returns an empty string", () => {
      expect(toQueryString({})).toBe("");
    });
  });

  describe("when given an object with one key-value pair", () => {
    it("returns a query string with one key-value pair", () => {
      expect(toQueryString({ key: "value" })).toBe("key=value");
    });
  });

  describe("when given an object with multiple key-value pairs", () => {
    it("returns a query string with multiple key-value pairs", () => {
      expect(toQueryString({ key1: "value1", key2: "value2" })).toBe(
        "key1=value1&key2=value2",
      );
    });
  });

  describe("when given an object with undefined values", () => {
    it("excludes the key-value pair from the query string", () => {
      expect(toQueryString({ key1: undefined, key2: "value" })).toBe(
        "key2=value",
      );
    });
  });

  describe("when given an object with keys in different orders", () => {
    it("returns a query string with keys in a determinist order", () => {
      expect(toQueryString({ b: "value1", a: "value2" })).toBe(
        "a=value2&b=value1",
      );
      expect(toQueryString({ a: "value1", b: "value2" })).toBe(
        "a=value1&b=value2",
      );
    });
  });
});
