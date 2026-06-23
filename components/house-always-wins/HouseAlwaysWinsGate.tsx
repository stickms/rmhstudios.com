"use client";

import { authClient } from "@/lib/auth-client";
import { useTranslation } from "react-i18next";
import { GameShell } from "./GameShell";

export function HouseAlwaysWinsGate() {
  const { t } = useTranslation("c-house-always-wins");
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-neutral-600 text-sm font-mono tracking-widest animate-pulse">
          {t("loading", { defaultValue: "LOADING..." })}
        </div>
      </div>
    );
  }

  if (!session.data?.user) {
    window.location.href = '/login?callbackURL=/house-always-wins';
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-neutral-600 text-sm font-mono tracking-widest animate-pulse">
          {t("loading", { defaultValue: "LOADING..." })}
        </div>
      </div>
    );
  }

  return <GameShell userName={session.data.user.name} />;
}
