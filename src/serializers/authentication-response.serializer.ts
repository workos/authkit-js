import { AuthenticationResponse, AuthenticationResponseRaw } from '../interfaces';
import { deserializeUser } from './user.serializer';

export const deserializeAuthenticationResponse = (
	authenticationResponse: AuthenticationResponseRaw,
): AuthenticationResponse => {
	const { user, organization_id, access_token, refresh_token, impersonator, ...rest } = authenticationResponse;

	return {
		user: deserializeUser(user),
		organizationId: organization_id,
		accessToken: access_token,
		refreshToken: refresh_token,
		impersonator,
		...rest,
	};
};
