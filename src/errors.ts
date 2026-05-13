export class AuthKitError extends Error {}
export class RefreshError extends AuthKitError {}
export class CodeExchangeError extends AuthKitError {}
export class LoginRequiredError extends AuthKitError {
  readonly message: string = "No access token available";
}

export class RefreshTimeoutError extends RefreshError {
  constructor(
    message = "Timed out waiting to refresh the session.",
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "RefreshTimeoutError";
    if (options?.cause) this.cause = options.cause;
  }
}

export class NoSessionError extends AuthKitError {
  readonly message =
    "SignOut() called without an active session. Provide a returnTo URL to redirect anyway.";
}
