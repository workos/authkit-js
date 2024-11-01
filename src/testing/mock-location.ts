const originalLocation = location;

export function mockLocation() {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...originalLocation, assign: jest.fn() },
  });
}

export function restoreLocation() {
  Object.defineProperty(globalThis, "location", {
    value: originalLocation,
  });
}
