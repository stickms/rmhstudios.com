'use client';

import { authClient } from "@/lib/auth-client";
import { useState, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FaDiscord } from "react-icons/fa";
import { MdEmail, MdLock, MdPerson } from "react-icons/md";

const allowEmailAuth = !!process.env.NEXT_PUBLIC_ALLOW_EMAIL_ONLY_AUTH;

function LoginForm() {
    const searchParams = useSearchParams();
    const rawCallback = searchParams.get("callbackURL") || searchParams.get("callbackUrl") || searchParams.get("next");

    const [callbackURL, setCallbackURL] = useState(() =>
        rawCallback?.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/games"
    );

    useEffect(() => {
        if (!rawCallback?.startsWith("/")) {
            try {
                const ref = new URL(document.referrer);
                if (ref.origin === window.location.origin && ref.pathname !== "/login") {
                    setCallbackURL(ref.pathname + ref.search);
                }
            } catch {}
        }
    }, [rawCallback]);

    const { data: session, isPending } = authClient.useSession();

    useEffect(() => {
        if (!isPending && session?.user) {
            window.location.href = callbackURL;
        }
    }, [isPending, session, callbackURL]);

    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form State
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleDiscordSignIn = async () => {
        setLoading(true);
        await authClient.signIn.social({
            provider: "discord",
            callbackURL,
        });
    };

    const handleCredentialsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                await authClient.signUp.email({
                    email,
                    password,
                    name: name || username,
                    username,
                    callbackURL
                } as any, {
                    onRequest: () => setLoading(true),
                    onSuccess: () => {
                        setLoading(false);
                        window.location.href = callbackURL;
                    },
                    onError: (ctx) => {
                        setLoading(false);
                        setError(ctx.error.message);
                    }
                });
            } else {
                await authClient.signIn.email({
                    email,
                    password,
                    callbackURL
                }, {
                    onRequest: () => setLoading(true),
                    onSuccess: () => {
                        setLoading(false);
                        window.location.href = callbackURL;
                    },
                    onError: (ctx) => {
                        setLoading(false);
                        setError(ctx.error.message);
                    }
                });
            }
        } catch (err) {
            setLoading(false);
            setError("Something went wrong. Please try again.");
        }
    };

    if (isPending || session?.user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-site-bg text-site-text" role="status" aria-live="polite">
                Loading...
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-site-bg text-site-text p-4 font-sans">
            <div className="w-full max-w-md bg-site-surface border border-site-border rounded-2xl p-8 shadow-lg">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black font-(family-name:--site-font-display) text-site-text mb-2">
                        RMH <span className="text-site-accent">Auth</span>
                    </h1>
                    <p className="text-site-text-muted text-sm">
                        {isSignUp ? "Create an identity to access the network." : "Authenticate to access your profile."}
                    </p>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleDiscordSignIn}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? (
                            <span className="animate-pulse">Connecting...</span>
                        ) : (
                            <>
                                <FaDiscord className="text-xl" />
                                <span>Continue with Discord</span>
                            </>
                        )}
                    </button>

                    {allowEmailAuth && (
                        <>
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-site-border"></div></div>
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-site-surface px-2 text-site-text-dim font-mono">Or using credentials</span></div>
                            </div>

                            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                                {isSignUp && (
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <MdPerson className="absolute left-3 top-1/2 -translate-y-1/2 text-site-text-dim" />
                                            <input
                                                type="text"
                                                placeholder="Username"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                required
                                                className="w-full bg-site-bg border border-site-border rounded-lg py-3 pl-10 px-4 text-site-text placeholder-site-text-dim focus:outline-none focus:ring-2 focus:ring-site-accent/50 transition-all"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="relative">
                                    <MdEmail className="absolute left-3 top-1/2 -translate-y-1/2 text-site-text-dim" />
                                    <input
                                        type="email"
                                        placeholder="Email Address"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="w-full bg-site-bg border border-site-border rounded-lg py-3 pl-10 px-4 text-site-text placeholder-site-text-dim focus:outline-none focus:ring-2 focus:ring-site-accent/50 transition-all"
                                    />
                                </div>

                                <div className="relative">
                                    <MdLock className="absolute left-3 top-1/2 -translate-y-1/2 text-site-text-dim" />
                                    <input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        className="w-full bg-site-bg border border-site-border rounded-lg py-3 pl-10 px-4 text-site-text placeholder-site-text-dim focus:outline-none focus:ring-2 focus:ring-site-accent/50 transition-all"
                                    />
                                </div>

                                {error && (
                                    <div className="text-site-danger text-xs text-center bg-site-danger/10 py-2 rounded border border-site-danger/30">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-site-accent hover:bg-site-accent-hover text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {loading ? "Processing..." : (isSignUp ? "Create Account" : "Sign In")}
                                </button>
                            </form>

                            <div className="text-center">
                                <button
                                    onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                                    className="text-site-text-dim hover:text-site-text text-sm transition-colors"
                                >
                                    {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-site-bg text-site-text">Loading...</div>}>
            <LoginForm />
        </Suspense>
    );
}
