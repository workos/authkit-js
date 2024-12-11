import {
  AuthenticationResponse,
  OnRefreshResponse,
} from "./authentication-response.interface";
import { createClient } from "../create-client";

export interface CreateClientOptions {
  /**
   * How many seconds before the access token expiration to attempt a refresh.
   */
  refreshBufferInterval?: number;

  apiHostname?: string;
  https?: boolean;
  port?: number;
  redirectUri?: string;
  devMode?: boolean;
  onRedirectCallback?: (_: RedirectParams) => void;
  onBeforeAutoRefresh?: () => boolean;
  onRefresh?: (_: OnRefreshResponse) => void;
  onRefreshFailure?: (args: {
    signIn: Awaited<ReturnType<typeof createClient>>["signIn"];
  }) => void;
}

export interface RedirectParams extends AuthenticationResponse {
  state: Record<string, any> | null;
}
