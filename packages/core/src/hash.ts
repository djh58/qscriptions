const HEX = "0123456789abcdef";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer so callers cannot mutate bytes while the
  // asynchronous digest is in flight and SharedArrayBuffer never crosses the API.
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", stable));
  let encoded = "";
  for (const byte of digest) {
    encoded += HEX.charAt(byte >>> 4) + HEX.charAt(byte & 0x0f);
  }
  return encoded;
}
