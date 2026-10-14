import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";

/**
 * Development-only: records route changes and warns with the full path history if the route flips
 * repeatedly in a short window (a redirect/navigation loop). It only observes; it never blocks navigation.
 */
export function NavMonitor() {
  const pathname = usePathname();
  const recent = useRef<{ path: string; at: number }[]>([]);
  useEffect(() => {
    if (!__DEV__) return;
    const now = Date.now();
    recent.current = [...recent.current.filter((e) => now - e.at < 2000), { path: pathname, at: now }];
    if (recent.current.length >= 15) {
      console.warn(`[nav] ${recent.current.length} route changes in 2 s — possible navigation loop: ${recent.current.map((e) => e.path).join(" → ")}`);
    }
  }, [pathname]);
  return null;
}
