import { TextEncoder, TextDecoder } from "node:util";
import { subtle } from "node:crypto";

Object.assign(globalThis, {
  // These are available globally in the browser, but not in a default
  // Jest/Node.js environment.
  TextEncoder,
  TextDecoder,
});

// Make Node's `SubleCrypto` implementation available.
Object.assign(globalThis.crypto, {
  subtle,
});
