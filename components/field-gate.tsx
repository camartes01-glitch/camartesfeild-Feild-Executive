import { Redirect } from "expo-router";
import { useApp } from "@/lib/app-context";

/** Auth gate for Field Executive screens that live outside the tab group (alerts, expenses). */
export function FieldGate({ children }: { children: React.ReactNode }) {
  const { ready, user } = useApp();
  if (!ready) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role === "operations_manager") return <Redirect href="/admin" />;
  return <>{children}</>;
}
