import { GetAuthorizationUrlOptions } from "../interfaces";
import { toQueryString } from "./to-query-string";

export function getAuthorizationUrl(
  baseUrl: string,
  {
    clientId,
    connectionId,
    context,
    domainHint,
    loginHint,
    organizationId,
    provider = "authkit",
    redirectUri,
    state,
    screenHint,
    passwordResetToken,
    invitationToken,
    codeChallenge,
    codeChallengeMethod,
  }: GetAuthorizationUrlOptions,
): string {
  if (!provider && !connectionId && !organizationId) {
    throw new TypeError(
      `Incomplete arguments. Need to specify either a 'connectionId', 'organizationId', or 'provider'.`,
    );
  }

  if (provider !== "authkit" && screenHint) {
    throw new TypeError(
      `'screenHint' is only supported for 'authkit' provider`,
    );
  }

  const query = toQueryString({
    connection_id: connectionId,
    context,
    organization_id: organizationId,
    domain_hint: domainHint,
    login_hint: loginHint,
    provider,
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    screen_hint: screenHint,
    invitation_token: invitationToken,
    password_reset_token: passwordResetToken,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  });

  return `${baseUrl}/user_management/authorize?${query}`;
}
