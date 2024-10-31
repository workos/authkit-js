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

// jest@29 uses jsdom@20 which includes its own implementation of `AbortSignal`
// that does not implement `timeout`. This workaround can be removed when jest@30
// is released as it depends on jsdom@22 which _does_ implement `timeout`.
AbortSignal.timeout = (ms: number) => {
  const controller = new AbortController();

  setTimeout(() => controller.abort("Timeout reached."), ms);

  return controller.signal;
};
