import { JWTHeader, JWTPayload } from "../interfaces/jwt.interface";

/**
 * Decodes a base64url encoded string
 * @param input The base64url string to decode
 * @returns The decoded string
 */
function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(base64 + padding);
}

/**
 * Decodes a JWT token and returns its header and payload
 * @param token The JWT token to decode
 * @return An object containing the decoded header and payload
 * @throws Error if the token is not in a valid JWT format or if decoding fails
 */
// should replace this with jose if we ever need to verify the JWT
export function decodeJwt<T = {}>(
  token: string,
): {
  header: JWTHeader;
  payload: JWTPayload & T;
} {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  try {
    const header = JSON.parse(decodeBase64Url(parts[0])) as JWTHeader;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as JWTPayload & T;

    return { header, payload };
  } catch (error) {
    throw new Error(
      `Failed to decode JWT: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
