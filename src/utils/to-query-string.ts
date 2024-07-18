export function toQueryString(options: Record<string, string | undefined>): string {
	const searchParams = new URLSearchParams();
	const keys = Object.keys(options).sort();

	for (const key of keys) {
		const value = options[key];

		if (value) {
			searchParams.append(key, value);
		}
	}

	return searchParams.toString();
}
