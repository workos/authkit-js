export class AuthKitError extends Error {}

export interface RefreshErrorOptions {
  cause?: unknown;
  /** HTTP status of the failed refresh response, if the failure was an HTTP error. */
  status?: number;
  /** OAuth error code from the response body (e.g. `"invalid_grant"`), if present. */
  error?: string;
  /**
   * Whether the failure is transient (network error, timeout, 429, or 5xx) and
   * the session should be preserved and retried, rather than terminal (the
   * refresh token is dead and the user must re-authenticate).
   */
  isTransient?: boolean;
}

export class RefreshError extends AuthKitError {
  readonly status?: number;
  readonly error?: string;
  readonly isTransient: boolean;

  constructor(message?: string, options: RefreshErrorOptions = {}) {
    super(
      message,
      options.cause != null ? { cause: options.cause } : undefined,
    );
    this.name = "RefreshError";
    this.status = options.status;
    this.error = options.error;
    this.isTransient = options.isTransient ?? false;
  }
}

export class CodeExchangeError extends AuthKitError {}
export class LoginRequiredError extends AuthKitError {
  readonly message: string = "No access token available";
}

export class RefreshTimeoutError extends RefreshError {
  constructor(
    message = "Timed out waiting to refresh the session.",
    options?: { cause?: unknown },
  ) {
    super(message, { cause: options?.cause, isTransient: true });
    this.name = "RefreshTimeoutError";
  }
}

export class NoSessionError extends AuthKitError {
  readonly message =
    "SignOut() called without an active session. Provide a returnTo URL to redirect anyway.";
}
