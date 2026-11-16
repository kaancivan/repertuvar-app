export const SESSION_COOKIE_NAME = "repertoire_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || `repertoire-pin-secret-${process.env.APP_PIN || "1234"}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(getSigningSecret());
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
  return toHex(signature);
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createSessionToken(): Promise<string> {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `auth.${issuedAt}.${expiresAt}`;
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;

  const [prefix, issuedStr, expiresStr, sig] = parts;
  if (prefix !== "auth") return false;

  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  const payload = `${prefix}.${issuedStr}.${expiresStr}`;
  const expectedSig = await signPayload(payload);
  return timingSafeEqualString(sig, expectedSig);
}

export function verifyPin(submittedPin: string): boolean {
  const expected = process.env.APP_PIN?.trim() || "1234";
  return timingSafeEqualString(submittedPin.trim(), expected);
}
