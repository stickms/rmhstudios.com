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
                } as any, { // Type assertion needed for custom fields until client types regenerate
                    onRequest: () => setLoading(true),
                    onSuccess: () => {
                        setLoading(false);
                        // Redirect handled by callbackURL usually, or we can push
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
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white" role="status" aria-live="polite">
                Loading...
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4 font-sans">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-linear-to-r from-blue-400 to-purple-600 mb-2">
                        RMH Auth
                    </h1>
                    <p className="text-slate-400 text-sm">
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
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-2 text-slate-600 font-mono">Or using credentials</span></div>
                            </div>

                            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                                {isSignUp && (
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <MdPerson className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="text"
                                                placeholder="Username"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                required
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 pl-10 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="relative">
                                    <MdEmail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="email"
                                        placeholder="Email Address"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 pl-10 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    />
                                </div>

                                <div className="relative">
                                    <MdLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 pl-10 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    />
                                </div>

                                {error && (
                                    <div className="text-red-400 text-xs text-center bg-red-900/20 py-2 rounded border border-red-900/50">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-slate-100 hover:bg-white text-slate-900 py-3 rounded-xl font-bold transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {loading ? "Processing..." : (isSignUp ? "Create Account" : "Sign In")}
                                </button>
                            </form>

                            <div className="text-center">
                                <button
                                    onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                                    className="text-slate-500 hover:text-white text-sm transition-colors"
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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Loading...</div>}>
            <LoginForm />
        </Suspense>
    );
}
