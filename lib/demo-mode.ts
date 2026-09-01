/**
 * Demo login is allowed only in development, or when EXPO_PUBLIC_DEMO_MODE=true.
 * Production builds leave this off unless that flag is set explicitly.
 */
export function isDemoMode(): boolean {
  const env = process.env.EXPO_PUBLIC_DEMO_MODE;
  if (env === "false" || env === "0") return false;
  if (env === "true" || env === "1") return true;
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/** Demo-only credentials. Never persisted, never used when demo mode is off. */
const DEMO_PASSWORDS: Record<string, string> = {
  "rahul@camartes.com": "field2026",
  "priya@camartes.com": "field2026",
  "arjun@camartes.com": "field2026",
  "ops@camartes.com": "field2026",
};

export function matchDemoPassword(email: string, password: string): boolean {
  if (!isDemoMode()) return false;
  const expected = DEMO_PASSWORDS[email.trim().toLowerCase()];
  return !!expected && expected === password;
}
