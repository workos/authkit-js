import Lock from "../vendor/browser-tabs-lock";

const DEFAULT_LOCK_TIMEOUT_MS = 10_000;

export function withLock<T>(
  lockName: string,
  callback: () => T | Promise<T>,
  { timeout = DEFAULT_LOCK_TIMEOUT_MS } = {},
): Promise<T> {
  if (!lockName) {
    throw new TypeError("lockName is required and must be a non-empty string.");
  }

  return "locks" in navigator
    ? withNativeLock(lockName, callback, timeout)
    : withVendorLock(lockName, callback, timeout);
}

async function withNativeLock<T>(
  lockName: string,
  callback: () => T | Promise<T>,
  timeout: number,
) {
  try {
    return await navigator.locks.request(
      lockName,
      { signal: AbortSignal.timeout(timeout) },
      callback,
    );
  } catch (error) {
    if (error instanceof DOMException) {
      switch (error.name) {
        case "AbortError":
          throw new LockError("AcquisitionTimeoutError", lockName, "Native");

        case "InvalidStateError":
        case "NotSupportedError":
        case "SecurityError":
        // These are documented but we currently don't handle them
        // in any particular way and let them bubble up.
      }
    }

    throw error;
  }
}

async function withVendorLock<T>(
  lockName: string,
  callback: () => T | Promise<T>,
  timeout: number,
) {
  const lock = new Lock();

  try {
    if (await lock.acquireLock(lockName, timeout)) {
      return await callback();
    } else {
      throw new LockError("AcquisitionTimeoutError", lockName, "Vendor");
    }
  } finally {
    await lock.releaseLock(lockName);
  }
}

export class LockError extends Error {
  constructor(
    override readonly name: "AcquisitionTimeoutError",
    readonly lockName: string,
    type: "Native" | "Vendor",
  ) {
    super(`Lock acquisition timed out for "${lockName}" (${type})`);
  }
}
