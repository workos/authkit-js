import { User, UserRaw } from "./user.interface";
import { Impersonator, ImpersonatorRaw } from "./impersonator.interface";

export interface AuthenticationResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  organizationId?: string;
  impersonator?: Impersonator;
}

export type OnRefreshResponse = Omit<AuthenticationResponse, "refreshToken">;

export interface AuthenticationResponseRaw {
  user: UserRaw;
  access_token: string;
  refresh_token: string;
  organization_id?: string;
  impersonator?: ImpersonatorRaw;
}
