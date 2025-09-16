/**
 * JWT (JSON Web Token) Interface Definitions
 */
export interface JWTHeader {
  alg: string;
  typ?: string | undefined;
  cty?: string | undefined;
  crit?: Array<string | Exclude<keyof JWTHeader, "crit">> | undefined;
  kid?: string | undefined;
  jku?: string | undefined;
  x5u?: string | string[] | undefined;
  "x5t#S256"?: string | undefined;
  x5t?: string | undefined;
  x5c?: string | string[] | undefined;
}
/**
 * JWT Payload Interface
 */
export interface JWTPayload {
  /**
   * Session ID of the JWT, used to identify the session
   */
  sid: string;

  /**
   * Issuer of the JWT
   */
  iss: string;
  /**
   * Subject of the JWT
   */
  sub: string;
  /**
   * Audience of the JWT, can be a single string or an array of strings
   */
  aud?: string | string[];
  /**
   * Expiration time of the JWT, represented as a Unix timestamp
   */
  exp: number;
  /**
   * Issued at time of the JWT, represented as a Unix timestamp
   */
  iat: number;
  /**
   * JWT ID, a unique identifier for the JWT
   */
  jti: string;

  /**
   * Organization ID associated with the JWT
   */
  org_id?: string;

  /**
   * Role of the user associated with the JWT
   */
  role?: string;

  /**
   * Role of the user associated with the JWT
   */
  roles?: string;

  /**
   * Permissions granted to the user associated with the JWT
   */
  permissions?: string[];

  /**
   * Feature flags granted to the organization associated with the JWT
   */
  feature_flags?: string[];
}
