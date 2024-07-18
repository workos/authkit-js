export class NoClientIdProvidedException extends Error {
	readonly status: number = 500;
	readonly name: string = 'NoClientIdProvidedException';
	readonly message: string = `Missing Client ID. Pass it to the constructor (createClient("client_01HXRMBQ9BJ3E7QSTQ9X2PHVB7"))`;
}
