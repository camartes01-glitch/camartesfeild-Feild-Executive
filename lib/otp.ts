/** In-app handover PIN — generated on device, never sent by SMS. */
export function generateHandoverPin(): string {
  const buf = new Uint32Array(1);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
    return String(1000 + (buf[0] % 9000));
  }
  return String(1000 + Math.floor(Math.random() * 9000));
}
