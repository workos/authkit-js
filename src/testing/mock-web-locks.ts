import assert from "node:assert";
import Lock from "../vendor/browser-tabs-lock";

/**
 * Neither Node or JSDOM provide an implementation of the Web Locks API, so we
 * implement a mock in terms of a locking implementation we do have on hand.
 */
export class MockWebLocks implements LockManager {
  async request(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback,
    callback?: LockGrantedCallback,
  ) {
    if (typeof optionsOrCallback === "function") {
      callback = optionsOrCallback;
    }

    assert.ok(callback, "A callback is required.");

    if (typeof optionsOrCallback !== "function" && optionsOrCallback.signal) {
      const { signal } = optionsOrCallback;

      const aborted = new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Abort error.", "AbortError"));
        });
      });

      return Promise.race([aborted, this.perform(name, callback)]);
    }

    return this.perform(name, callback);
  }

  private async perform(
    name: string,
    callback: LockGrantedCallback,
  ): Promise<void> {
    const lock = new Lock();

    try {
      if (await lock.acquireLock(name)) {
        return await callback({
          name,
          mode: "exclusive",
        });
      } else {
        throw new DOMException("Abort error.", "AbortError");
      }
    } finally {
      lock.releaseLock(name);
    }
  }

  async query(): Promise<LockManagerSnapshot> {
    throw new Error("Method not implemented.");
  }
}
