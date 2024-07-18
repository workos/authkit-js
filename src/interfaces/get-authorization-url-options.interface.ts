export interface GetAuthorizationUrlOptions {
	clientId: string;
	connectionId?: string;
	organizationId?: string;
	domainHint?: string;
	loginHint?: string;
	provider?: string;
	redirectUri?: string;
	state?: string;
	screenHint?: 'sign-up' | 'sign-in';
	codeChallenge?: string;
	codeChallengeMethod?: string;
}
