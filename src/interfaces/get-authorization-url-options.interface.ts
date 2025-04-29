export interface GetAuthorizationUrlOptions {
  connectionId?: string;
  /**
   *  @deprecated We previously required initiate login endpoints to return the `context`
   *  query parameter when getting the authorization URL. This is no longer necessary.
   */
  context?: string;
  organizationId?: string;
  domainHint?: string;
  loginHint?: string;
  provider?: string;
  redirectUri?: string;
  state?: string;
  screenHint?: "sign-up" | "sign-in";
  invitationToken?: string;
  passwordResetToken?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}
