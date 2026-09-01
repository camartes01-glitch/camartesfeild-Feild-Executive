import { Platform } from "react-native";
import Constants from "expo-constants";

const DEFAULT_PORT = "8000";

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function lanHostFromExpo(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? "";
  const fromUri = String(Constants.linkingUri ?? "");
  const match = `${hostUri} ${fromUri}`.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  const host = match?.[1];
  if (!host || host.startsWith("127.") || host === "0.0.0.0") return null;
  return host;
}

/**
 * Dedicated Field Operations API origin. Never the marketplace/Render URL.
 *
 * Set EXPO_PUBLIC_FIELD_OPS_API in all production builds.
 * Local defaults (development only):
 * - Web / iOS simulator: http://127.0.0.1:8000
 * - Android emulator: http://10.0.2.2:8000
 * - Physical device: http://<Metro LAN IP>:8000 (inferred) or set EXPO_PUBLIC_FIELD_OPS_API
 */
export function fieldOpsApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_FIELD_OPS_API?.trim();
  if (configured) return trimSlash(configured);
  if (typeof __DEV__ === "undefined" || !__DEV__) return "";
  const lan = lanHostFromExpo();
  if (lan) return `http://${lan}:${DEFAULT_PORT}`;
  if (Platform.OS === "android") return `http://10.0.2.2:${DEFAULT_PORT}`;
  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

export const FIELD_OPS_API = fieldOpsApiBaseUrl();
