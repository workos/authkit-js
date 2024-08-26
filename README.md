# AuthKit JavaScript Library

This library provides an interface to interact with AuthKit in client-side JavaScript applications.

## Installation

```bash
npm install @workos-inc/authkit-js
```

## Usage

```javascript
import { createClient } from '@workos-inc/authkit-js';

const authkit = await createClient('your-client-id');
const user = authkit.getUser();
const accessToken = await authkit.getAccessToken();
```

## API Reference

### `createClient(clientId: string, options?: CreateClientOptions): Promise<AuthKitClient>`

Creates and initializes an AuthKit client.

#### Parameters:
- `clientId`: Your AuthKit client ID.
- `options`: (Optional) Configuration options for the client.

#### Returns:
A Promise that resolves to an AuthKitClient object with the following methods:

- `signIn(opts?: Omit<RedirectOptions, "type">): Promise<void>`
- `signUp(opts?: Omit<RedirectOptions, "type">): Promise<void>`
- `getUser(): User | null`
- `getAccessToken(): Promise<string | undefined>`
- `refreshSession({ organizationId }?: { organizationId?: string }): Promise<void>`
- `signOut(): void`

### CreateClientOptions

```typescript
interface CreateClientOptions {
  // Use this to override the default API hostname
  // This is useful for avoiding problems with agressive firewalls/filters
  // Default: https://api.workos.com
  apiHostname?: string;
  // Use this to override the default HTTPS protocol (best for local development only)
  // Default: true
  https?: boolean;
  // Use this to override the default port
  // Default: 443
  https?: boolean;
  port?: number;
  // Use this to override the default redirect URI
  redirectUri?: string;
  devMode?: boolean;
  // This is helpful for binding the AuthKit SDK to other reactive frameworks
  onRedirectCallback?: (_: RedirectParams) => void;
  onBeforeAutoRefresh?: () => boolean;
  onRefresh?: (_: AuthenticationResponse) => void;
}
```

### User Object

```typescript
interface User {
  object: "user";
  id: string;
  email: string;
  emailVerified: boolean;
  profilePictureUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### AuthenticationResponse

```typescript
interface AuthenticationResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  organizationId?: string;
  impersonator?: Impersonator;
}
```

### Impersonator

```typescript
interface Impersonator {
  email: string;
  reason: string | null;
}
```

### RedirectOptions

```typescript
interface RedirectOptions {
  type: "sign-in" | "sign-up";
  state?: any;
  invitationToken?: string;
  passwordResetToken?: string;
}
```

### `getClaims(accessToken: string): AccessToken`

Extracts claims from an access token.

#### Parameters:
- `accessToken`: The access token string.

#### Returns:
An AccessToken object containing the token claims.

```typescript
interface AccessToken {
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  sid: string;
  sub: string;
  org_id?: string;
  role?: string;
  permissions?: string[];
}
```

## Example Usage

```javascript
import { createClient, getClaims } from '@workos-inc/authkit-js';

async function initializeAuthKit() {
  const authkit = await createClient('your-client-id', {
    redirectUri: 'https://your-app.com/callback',
    onRedirectCallback: (params) => {
      console.log('Redirect callback:', params);
    },
  });

  // Sign in
  await authkit.signIn({ state: { returnTo: '/dashboard' } });

  // Get user
  const user = authkit.getUser();
  console.log('Current user:', user);

  // Get access token
  const accessToken = await authkit.getAccessToken();
  console.log('Access token:', accessToken);

  // Get token claims
  const claims = getClaims(accessToken);
  console.log('Token claims:', claims);

  // Refresh session
  await authkit.refreshSession();

  // Sign out
  authkit.signOut();
}

initializeAuthKit();
```

This documentation provides a comprehensive overview of the AuthKit JavaScript library, including its main functions, interfaces, and usage examples. It covers the creation of the client, authentication flows, user management, and token handling.
