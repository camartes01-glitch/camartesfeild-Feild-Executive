/** In-app handover PIN — generated on device, never sent by SMS. */
export function generateHandoverPin(): string {
  const n = 1000 + Math.floor(Math.random() * 9000);
  return String(n);
}
