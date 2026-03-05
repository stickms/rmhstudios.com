'use client';

import { authClient } from "@/lib/auth-client";
import { useState, useRef, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FaDiscord, FaGoogle, FaGithub } from "react-icons/fa";
import { MdEmail, MdLock, MdPerson, MdCameraAlt } from "react-icons/md";
import { ImageCropModal } from "@/components/feed/ImageCropModal";

function LoginForm() {
    const searchParams = useSearchParams();
    const rawCallback = searchParams.get("callbackURL") || searchParams.get("callbackUrl") || searchParams.get("next");

    const [callbackURL, setCallbackURL] = useState(() =>
        rawCallback?.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/"
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
    const [displayName, setDisplayName] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Avatar state
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        return () => {
            if (avatarPreview) URL.revokeObjectURL(avatarPreview);
            if (cropSrc) URL.revokeObjectURL(cropSrc);
        };
    }, [avatarPreview, cropSrc]);

    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setError("Image must be under 5 MB.");
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setCropSrc(objectUrl);
        e.target.value = "";
    };

    const handleCropDone = (croppedBlob: Blob) => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        const preview = URL.createObjectURL(croppedBlob);
        setAvatarPreview(preview);
        setAvatarFile(new File([croppedBlob], "avatar.png", { type: "image/png" }));
        setCropSrc(null);
    };

    const handleCropCancel = () => {
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null);
    };

    const handleDiscordSignIn = async () => {
        setLoading(true);
        await authClient.signIn.social({
            provider: "discord",
            callbackURL,
        });
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        await authClient.signIn.social({
            provider: "google",
            callbackURL,
        });
    };

    const handleGitHubSignIn = async () => {
        setLoading(true);
        await authClient.signIn.social({
            provider: "github",
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
                    name: displayName,
                    image: avatarFile ? undefined : "/images/social/default_avatar.png",
                    callbackURL
                } as any, {
                    onRequest: () => setLoading(true),
                    onSuccess: async () => {
                        // Upload avatar if one was selected
                        if (avatarFile) {
                            try {
                                const formData = new FormData();
                                formData.append("avatar", avatarFile);
                                await fetch("/api/profile/avatar", {
                                    method: "POST",
                                    body: formData,
                                });
                            } catch {
                                // Avatar upload failed silently — user can set it later
                            }
                        }
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
            <div className="w-full max-w-md bg-site-surface border border-site-border rounded-2xl p-6 sm:p-8 shadow-lg">
                <div className="text-center mb-6 sm:mb-8">
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

                    <button
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 py-3 rounded-xl font-bold transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] border border-gray-300"
                    >
                        {loading ? (
                            <span className="animate-pulse">Connecting...</span>
                        ) : (
                            <>
                                <FaGoogle className="text-xl" />
                                <span>Continue with Google</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleGitHubSignIn}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 bg-[#24292e] hover:bg-[#1a1e22] text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? (
                            <span className="animate-pulse">Connecting...</span>
                        ) : (
                            <>
                                <FaGithub className="text-xl" />
                                <span>Continue with GitHub</span>
                            </>
                        )}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-site-border"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-site-surface px-2 text-site-text-dim font-mono">Or using credentials</span></div>
                    </div>

                    <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                        {isSignUp && (
                            <div className="space-y-4">
                                {/* Avatar picker */}
                                <div className="flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="relative w-20 h-20 rounded-full bg-site-bg border-2 border-dashed border-site-border hover:border-site-accent flex items-center justify-center transition-colors group"
                                    >
                                        <img
                                            src={avatarPreview || "/images/social/default_avatar.png"}
                                            alt="Avatar preview"
                                            className="w-full h-full rounded-full object-cover"
                                        />
                                        <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 bg-site-accent rounded-full flex items-center justify-center border-2 border-site-surface">
                                            <MdCameraAlt className="w-3.5 h-3.5 text-white" />
                                        </div>
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/gif,image/webp"
                                        className="hidden"
                                        onChange={handleAvatarSelect}
                                    />
                                </div>
                                <p className="text-center text-xs text-site-text-dim -mt-2">Optional profile picture</p>

                                {/* Display Name */}
                                <div className="relative">
                                    <MdPerson className="absolute left-3 top-1/2 -translate-y-1/2 text-site-text-dim" />
                                    <input
                                        type="text"
                                        placeholder="Display Name"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
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
                </div>
            </div>

            {cropSrc && (
                <ImageCropModal
                    imageSrc={cropSrc}
                    onCropDone={handleCropDone}
                    onCancel={handleCropCancel}
                />
            )}
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
