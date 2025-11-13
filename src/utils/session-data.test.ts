import { setSessionData } from "./session-data";
import { storageKeys } from "./storage-keys";
import { memoryStorage } from "./memory-storage";
import { User } from "../interfaces/user.interface";

const mockUser: User = {
  object: "user",
  id: "123",
  email: "test@example.com",
  emailVerified: true,
  profilePictureUrl: "https://example.com/profile.png",
  firstName: "Test",
  lastName: "User",
  externalId: "123",
  lastSignInAt: new Date("2021-01-01").toISOString(),
  createdAt: new Date("2021-01-01").toISOString(),
  updatedAt: new Date("2021-01-01").toISOString(),
};

describe("setSessionData", () => {
  // Valid JWT token for testing (not a real token, just for testing purposes)
  const validToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5In0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwic3ViIjoiMTIzNDU2Nzg5MCIsImF1ZCI6WyJhdWRpZW5jZTEiLCJhdWRpZW5jZTIiXSwiZXhwIjoxNzM1Njg5NjAwLCJpYXQiOjE3MzU2MDMyMDAsImp0aSI6InVuaXF1ZS1pZCIsImN1c3RvbSI6InZhbHVlIiwibmVzdGVkIjp7ImtleSI6InZhbHVlIn19.signature";

  it("updates storage when the access token is set", () => {
    const currentAccessToken = memoryStorage.getItem(storageKeys.accessToken);
    setSessionData({
      accessToken: validToken,
      refreshToken: "refresh_token",
      user: mockUser,
    });
    expect(memoryStorage.getItem(storageKeys.accessToken)).toBe(validToken);
    expect(memoryStorage.getItem(storageKeys.accessToken)).not.toBe(
      currentAccessToken,
    );
  });
});
