"use client";

import { authClient } from "@/lib/auth-client";
import { LoggedOutScreen } from "./LoggedOutScreen";
import { GameShell } from "./GameShell";

export function HouseAlwaysWinsGate() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-neutral-600 text-sm font-mono tracking-widest animate-pulse">
          LOADING...
        </div>
      </div>
    );
  }

  if (!session.data?.user) {
    return <LoggedOutScreen />;
  }

  return <GameShell userName={session.data.user.name} />;
}
