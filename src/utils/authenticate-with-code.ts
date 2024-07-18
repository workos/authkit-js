import { AuthenticationResponseRaw } from '../interfaces';
import { deserializeAuthenticationResponse } from '../serializers';

interface AuthenticateWithCodeOptions {
  baseUrl: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  useCookie: boolean;
}

export async function authenticateWithCode(options: AuthenticateWithCodeOptions) {
  const { baseUrl, clientId, code, codeVerifier, useCookie } = options;
  const response = await fetch(`${baseUrl}/user_management/authenticate`, {
    method: 'POST',
    ...(useCookie && { credentials: 'include' }),
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      client_id: clientId,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });

  if (response.ok) {
    const data = (await response.json()) as AuthenticationResponseRaw;
    return deserializeAuthenticationResponse(data);
  } else {
    console.log('error', await response.json());
  }
}
