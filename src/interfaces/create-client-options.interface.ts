import { AuthenticationResponse } from "./authentication-response.interface";

export interface CreateClientOptions {
  apiHostname?: string;
  https?: boolean;
  port?: number;
  redirectUri?: string;
  devMode?: boolean;
  onRedirectCallback?: (_: RedirectParams) => void;
  onBeforeAutoRefresh?: () => boolean;
  onRefresh?: (_: AuthenticationResponse) => void;
}

export interface RedirectParams extends AuthenticationResponse {
  state: Record<string, any> | null;
}
