import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useDiscordSdk } from '@/lib/discord-sdk';

const LightsOutDiscordActivity = lazy(() =>
    import('@/components/lights-out/LightsOutDiscordActivity').then(m => ({
        default: m.LightsOutDiscordActivity,
    }))
);

function DiscordLightsOutPage() {
    const { t } = useTranslation("r-discord");
    const discord = useDiscordSdk();

    if (discord.status === 'loading') {
        return (
            <div className="min-h-screen bg-[#313338] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-[#b5bac1] text-sm">{t("connecting-to-discord", { defaultValue: "Connecting to Discord..." })}</p>
                </div>
            </div>
        );
    }

    if (discord.status === 'error') {
        return (
            <div className="min-h-screen bg-[#313338] flex items-center justify-center p-4">
                <div className="text-center max-w-sm">
                    <div className="text-4xl mb-3">😵</div>
                    <h2 className="text-white text-lg font-semibold mb-2">{t("connection-failed", { defaultValue: "Connection Failed" })}</h2>
                    <p className="text-[#b5bac1] text-sm mb-4">{discord.error}</p>
                    <p className="text-[#949ba4] text-xs">
                        {t("run-inside-discord-activity", { defaultValue: "Make sure you're running this inside a Discord Activity." })}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-[#313338] flex items-center justify-center">
                    <div className="animate-pulse text-[#b5bac1]">{t("loading-game", { defaultValue: "Loading game..." })}</div>
                </div>
            }
        >
            <LightsOutDiscordActivity discord={discord.context} />
        </Suspense>
    );
}

export const Route = createFileRoute('/discord/lights-out')({
    component: DiscordLightsOutPage,
});
