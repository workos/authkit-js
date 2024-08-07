export interface GetAuthorizationUrlOptions {
  clientId: string;
  connectionId?: string;
  organizationId?: string;
  domainHint?: string;
  loginHint?: string;
  provider?: string;
  redirectUri?: string;
  state?: string;
  screenHint?: "sign-up" | "sign-in";
  invitationToken?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}
