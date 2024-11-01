import { TestEnvironment as JsDomEnvironment } from "jest-environment-jsdom";
import nock from "nock";

export default class CustomEnvironment extends JsDomEnvironment {
  async setup() {
    await super.setup();

    Object.assign(this.global, {
      // These are available globally in the browser, but not in a default
      // Jest/Node.js environment.
      TextEncoder,
      TextDecoder,

      // jest@29 uses jsdom@20 which includes its own implementation of `AbortSignal`
      // that does not implement `timeout`. This workaround can be removed when jest@30
      // is released as it depends on jsdom@22 which _does_ implement `timeout`.
      AbortSignal,

      // JSDOM does not implement `fetch`, so we re-use Node's implementation.
      fetch,

      // Needed by Nock interceptors declared from within tests.
      ReadableStream,
      Request,
      Response,
      TransformStream,
    });

    // Make Node's `SubleCrypto` implementation available.
    Object.assign(this.global.crypto, {
      subtle: crypto.subtle,
    });

    // Start interceptring and disabling network requests now. This can't be done from
    // within the JSDOM environment.
    nock.disableNetConnect();
  }

  async teardown() {
    await super.teardown();

    nock.enableNetConnect();
  }
}
