import { AuthenticationResponseRaw } from "../interfaces";
import { deserializeAuthenticationResponse } from "../serializers";

interface AuthenticateWithRefreshTokenOptions {
  baseUrl: string;
  clientId: string;
  refreshToken: string | undefined;
  useCookie: boolean;
}

export class RefreshError extends Error {}

export async function authenticateWithRefreshToken(
  options: AuthenticateWithRefreshTokenOptions,
) {
  const { baseUrl, clientId, refreshToken, useCookie } = options;
  const response = await fetch(`${baseUrl}/user_management/authenticate`, {
    method: "POST",
    ...(useCookie && { credentials: "include" }),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      grant_type: "refresh_token",
      ...(!useCookie && { refresh_token: refreshToken }),
    }),
  });

  if (response.ok) {
    const data = (await response.json()) as AuthenticationResponseRaw;
    return deserializeAuthenticationResponse(data);
  } else {
    const error = (await response.json()) as any;
    throw new RefreshError(error.error_description);
  }
}
