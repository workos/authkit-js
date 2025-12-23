import { User, UserRaw } from "./user.interface";
import { Impersonator, ImpersonatorRaw } from "./impersonator.interface";

export type AuthenticationMethod =
  | "SSO"
  | "Password"
  | "Passkey"
  | "AppleOAuth"
  | "BitbucketOAuth"
  | "CrossAppAuth"
  | "DiscordOAuth"
  | "ExternalAuth"
  | "GitHubOAuth"
  | "GitLabOAuth"
  | "GoogleOAuth"
  | "LinkedInOAuth"
  | "MicrosoftOAuth"
  | "SalesforceOAuth"
  | "SlackOAuth"
  | "VercelMarketplaceOAuth"
  | "VercelOAuth"
  | "XeroOAuth"
  | "MagicAuth"
  | "Impersonation"
  | "MigratedSession";

export interface AuthenticationResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  authenticationMethod: AuthenticationMethod;
  organizationId?: string;
  impersonator?: Impersonator;
}

export type OnRefreshResponse = Omit<AuthenticationResponse, "refreshToken">;

export interface AuthenticationResponseRaw {
  user: UserRaw;
  access_token: string;
  refresh_token: string;
  authentication_method: AuthenticationMethod;
  organization_id?: string;
  impersonator?: ImpersonatorRaw;
}
