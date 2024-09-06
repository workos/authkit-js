import { RefreshError } from "../errors";
import { AuthenticationResponseRaw } from "../interfaces";
import { deserializeAuthenticationResponse } from "../serializers";

interface AuthenticateWithRefreshTokenOptions {
  baseUrl: string;
  clientId: string;
  refreshToken: string | undefined;
  organizationId?: string;
  useCookie: boolean;
}

export async function authenticateWithRefreshToken({
  baseUrl,
  clientId,
  refreshToken,
  organizationId,
  useCookie,
}: AuthenticateWithRefreshTokenOptions) {
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
      organization_id: organizationId,
    }),
  });

  if (response.ok) {
    const data = (await response.json()) as AuthenticationResponseRaw;
    return deserializeAuthenticationResponse(data);
  } else {
    // TODO: a 500 error should be different than a 400 error (500s should
    // continue to retry?)
    const error = (await response.json()) as any;
    throw new RefreshError(error.error_description);
  }
}
