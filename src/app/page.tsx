"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MapPinned, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/app-context";

export default function LoginPage() {
  const { user, ready, login } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("rahul@camartes.com");
  const [password, setPassword] = useState("field2026");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace("/app");
  }, [ready, user, router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const msg = login(email, password);
    if (msg) setError(msg);
    else router.push("/app");
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.92_0.06_70),_transparent_55%)]" />
      <div className="relative w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Camera className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Camartes Field</h1>
          <p className="text-muted-foreground text-sm">
            For field executives handling address checks, rental deliveries, returns and store counts across Hyderabad.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              <Button type="submit" className="w-full" size="lg">
                Sign in
              </Button>
            </form>
            <p className="text-muted-foreground mt-4 text-center text-xs">
              Demo accounts: rahul@camartes.com or priya@camartes.com · password field2026
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
          <div className="rounded-xl border p-3">
            <MapPinned className="mx-auto mb-1 size-4" />
            Live location
          </div>
          <div className="rounded-xl border p-3">
            <ShieldCheck className="mx-auto mb-1 size-4" />
            Geotagged proofs
          </div>
          <div className="rounded-xl border p-3">
            <Camera className="mx-auto mb-1 size-4" />
            Kit chain of custody
          </div>
        </div>
      </div>
    </div>
  );
}
