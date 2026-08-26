"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  LayoutGrid,
  LogOut,
  MapPin,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Home", icon: LayoutGrid },
  { href: "/app/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/app/attendance", label: "Hours", icon: Clock3 },
  { href: "/app/leave", label: "Leave", icon: CalendarDays },
];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading Camartes Field…
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, live, openShift } = useApp();
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col bg-background pb-20">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {user?.avatarInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <MapPin className="size-3" />
              {live
                ? `${live.source === "simulated" ? "Simulated" : "Live"} · ±${Math.round(live.accuracyM)}m`
                : "Waiting for location"}
              {openShift ? " · On shift" : " · Off shift"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Log out"
            onClick={() => {
              logout();
              router.replace("/");
            }}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((item) => {
            const active =
              item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
