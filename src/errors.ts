export class AuthKitError extends Error {}
export class RefreshError extends AuthKitError {}
export class CodeExchangeError extends AuthKitError {}
export class LoginRequiredError extends AuthKitError {
  readonly message: string = "No access token available";
}
