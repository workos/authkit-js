function createMemoryStorage() {
	let _store: { [key: string]: unknown } = {};

	function setItem(key: string, value: unknown): void {
		_store[key] = value;
	}

	function getItem(key: string): unknown {
		return _store[key];
	}

	function removeItem(key: string): void {
		delete _store[key];
	}

	function reset(): void {
		_store = {};
	}

	return {
		setItem,
		getItem,
		removeItem,
		reset,
	};
}

const memoryStorage = createMemoryStorage();

export { memoryStorage };
