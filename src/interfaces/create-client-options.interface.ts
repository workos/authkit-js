import { AuthenticationResponse } from "./authentication-response.interface";
import { createClient } from "../create-client";

export interface CreateClientOptions {
  apiHostname?: string;
  https?: boolean;
  port?: number;
  redirectUri?: string;
  devMode?: boolean;
  onRedirectCallback?: (_: RedirectParams) => void;
  onBeforeAutoRefresh?: () => boolean;
  onRefresh?: (_: AuthenticationResponse) => void;
  onRefreshFailure?: (args: {
    signIn: Awaited<ReturnType<typeof createClient>>["signIn"];
  }) => void;
}

export interface RedirectParams extends AuthenticationResponse {
  state: Record<string, any> | null;
}
