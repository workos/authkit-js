import { withLock } from "./locking";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("locking", () => {
  describe("withLock", () => {
    describe("when no lockName is provided", () => {
      it("throws a TypeError", async () => {
        expect(() => withLock("", () => {})).toThrow(TypeError);
      });
    });

    describe("when `navigator.locks` is not available", () => {
      it("returns the result of the callback", async () => {
        await expect(withLock("LOCK_NAME", () => true)).resolves.toBe(true);
      });

      describe("when the lock is held by another process", () => {
        describe("when the lock is released before the timeout", () => {
          it("returns the result of the callback", async () => {
            const lockedTask = withLock("LOCK_NAME", () => delay(2000));

            // Ensure the locked task gets started first.
            await Promise.race([lockedTask, delay(500)]);

            const requestingTask = withLock("LOCK_NAME", () => true);

            // Check that the requesting task is indeed waiting and not resolved yet.
            await expect(
              Promise.race([
                delay(500).then(() => "delayFinishedFirst"),
                lockedTask.then(() => "lockedProcessFinishedFirst"),
                requestingTask.then(() => "requestingProcessFinishedFirst"),
              ]),
            ).resolves.toBe("delayFinishedFirst");

            // Check that the requesting task eventually gets through.
            await expect(requestingTask).resolves.toBe(true);
          });
        });

        describe("when the lock is not released before the timeout", () => {
          it("throws a `LockError`", async () => {
            const lockedTask = withLock("LOCK_NAME", () => delay(2000));

            // Ensure the locked task gets started first.
            await Promise.race([lockedTask, delay(500)]);

            const requestingTask = withLock("LOCK_NAME", () => true, {
              timeout: 1000,
            });

            // Check that the requesting task is indeed waiting and not resolved yet.
            await expect(
              Promise.race([
                delay(500).then(() => "delayFinishedFirst"),
                lockedTask.then(() => "lockedProcessFinishedFirst"),
                requestingTask.then(() => "requestingProcessFinishedFirst"),
              ]),
            ).resolves.toBe("delayFinishedFirst");

            // Check that the requesting task eventually fails with the `LockError`.
            await expect(requestingTask).rejects.toMatchObject({
              name: "AcquisitionTimeoutError",
              lockName: "LOCK_NAME",
            });
          });
        });

        describe("when the task throws an error", () => {
          it("releases the lock and rethrows the error", async () => {
            await expect(
              withLock("LOCK_NAME", async () => {
                throw new Error("Some error");
              }),
            ).rejects.toThrow("Some error");

            // Ensure the lock is released.
            await expect(withLock("LOCK_NAME", () => true)).resolves.toBe(true);
          });
        });
      });
    });
  });
});
