export async function createPkceChallenge() {
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);

  return { codeVerifier, codeChallenge };
}

function createCodeVerifier() {
  const randomBytes = crypto.getRandomValues(new Uint32Array(96));
  return base64urlEncode(randomBytes);
}

async function createCodeChallenge(codeVerifier: string) {
  const hashed = await sha256(codeVerifier);
  return base64urlEncode(hashed);
}

function base64urlEncode(buffer: ArrayBuffer): string {
  return btoa(
    Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(""),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}
