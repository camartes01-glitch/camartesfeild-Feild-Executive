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

export type ApiUrlValidationResult = {
  valid: boolean;
  url?: string;
  error?: string;
};

export function validateApiUrl(rawUrl: string, isProduction: boolean): ApiUrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    if (isProduction) {
      return {
        valid: false,
        error: "Production configuration error: EXPO_PUBLIC_FIELD_OPS_API is not set.",
      };
    }
    return { valid: false, error: "API URL is empty." };
  }

  try {
    const parsed = new URL(trimmed);

    if (isProduction) {
      if (parsed.protocol !== "https:") {
        return {
          valid: false,
          error: `Production configuration error: EXPO_PUBLIC_FIELD_OPS_API must use HTTPS protocol. Received '${parsed.protocol}'.`,
        };
      }

      const host = parsed.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host.startsWith("127.") ||
        host.startsWith("10.") ||
        host.startsWith("192.168.")
      ) {
        return {
          valid: false,
          error: `Production configuration error: EXPO_PUBLIC_FIELD_OPS_API cannot use localhost or local IP '${host}'.`,
        };
      }
    }

    return { valid: true, url: trimSlash(parsed.toString()) };
  } catch (err) {
    return {
      valid: false,
      error: `Invalid API URL format '${trimmed}': ${(err as Error).message}`,
    };
  }
}

/**
 * Dedicated Field Operations API origin. Never the marketplace/Render URL.
 *
 * In production: REQUIRES valid HTTPS EXPO_PUBLIC_FIELD_OPS_API. Fails closed if missing/invalid.
 * In development: Uses EXPO_PUBLIC_FIELD_OPS_API or falls back to local Metro/emulator IP.
 */
export function fieldOpsApiBaseUrl(customEnv?: { EXPO_PUBLIC_FIELD_OPS_API?: string; isDev?: boolean }): string {
  const isDevMode = customEnv?.isDev !== undefined ? customEnv.isDev : (typeof __DEV__ !== "undefined" ? __DEV__ : false);
  const isProd = !isDevMode;
  const configured = customEnv?.EXPO_PUBLIC_FIELD_OPS_API !== undefined 
    ? customEnv.EXPO_PUBLIC_FIELD_OPS_API.trim() 
    : (process.env.EXPO_PUBLIC_FIELD_OPS_API?.trim() ?? "");

  if (configured) {
    const validation = validateApiUrl(configured, isProd);
    if (!validation.valid) {
      if (isProd) {
        throw new Error(validation.error);
      }
      return trimSlash(configured);
    }
    return validation.url!;
  }

  if (isProd) {
    return "";
  }

  const lan = lanHostFromExpo();
  if (lan) return `http://${lan}:${DEFAULT_PORT}`;
  if (Platform.OS === "android") return `http://10.0.2.2:${DEFAULT_PORT}`;
  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

/** Non-throwing variant for the UI: fail closed (no URL) and report why. */
export function apiConfigStatus(): { url: string; error: string | null } {
  try {
    const url = fieldOpsApiBaseUrl();
    return { url, error: url ? null : "Production configuration error: EXPO_PUBLIC_FIELD_OPS_API is not set." };
  } catch (err) {
    return { url: "", error: (err as Error).message };
  }
}

