'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Terminal, Copy, Check, Key, ExternalLink, Boxes, Zap, Shield, GitBranch, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import TokenGenerator from './components/TokenGenerator';

const INSTALL_COMMAND = 'curl -fsSL https://raw.githubusercontent.com/ka1kqi/rmhcode/main/install.sh | bash';

export default function RmhCodePage() {
  const { data: session, isPending } = useSession();
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const features = [
    {
      icon: Zap,
      title: 'AI-Powered Coding',
      description: 'Build projects with Claude Code, the most capable AI coding assistant.',
    },
    {
      icon: Boxes,
      title: 'User Builds Showcase',
      description: 'Publish your creations to the community showcase with a single command.',
    },
    {
      icon: Shield,
      title: 'RMH Account Integration',
      description: 'Sign in with your rmhstudios.com account for seamless authentication.',
    },
    {
      icon: GitBranch,
      title: 'Project Publishing',
      description: 'Push builds directly from the CLI with metadata, tags, and descriptions.',
    },
  ];

  return (
    <div className="min-h-screen bg-site-bg relative">
      {/* Back Button */}
      <div className="absolute top-4 left-4 z-50">
        <Link href="/builds">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Back to Builds</span>
          </Button>
        </Link>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-fuchsia-600/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-500/20 via-transparent to-transparent" />

        <div className="relative max-w-4xl mx-auto px-4 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            {/* Hero Image */}
            <div className="flex justify-center mb-8">
              <div className="relative w-64 h-80 md:w-80 md:h-[28rem] rounded-2xl overflow-hidden border border-violet-500/30 shadow-2xl shadow-violet-500/20">
                <Image
                  src="/images/games/rmhcode.png"
                  alt="rmhcode"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-bold text-site-text mb-4 font-(family-name:--site-font-display)">
              rmh<span className="text-violet-400">code</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-site-text-muted max-w-xl mx-auto mb-8">
              AI-powered coding assistant with RMH integrations. Build projects with Claude and publish to the User Builds showcase.
            </p>

            {/* Beta Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              Beta
            </div>
          </motion.div>

          {/* Install Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-2xl mx-auto"
          >
            <div className="rounded-xl border border-site-border bg-site-surface/80 backdrop-blur-sm p-6">
              <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-violet-400" />
                Quick Install
              </h2>

              <div className="relative">
                <pre className="p-4 rounded-lg bg-site-bg border border-site-border overflow-x-auto text-sm text-site-text-muted font-mono">
                  <code>{INSTALL_COMMAND}</code>
                </pre>
                <button
                  onClick={copyCommand}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-site-surface hover:bg-site-surface-hover border border-site-border transition-colors"
                  aria-label="Copy command"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-site-text-muted" />
                  )}
                </button>
              </div>

              <p className="text-sm text-site-text-dim mt-3">
                Requires Node.js 18+ and a Claude API key.{' '}
                <a
                  href="https://github.com/ka1kqi/rmhcode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-1"
                >
                  View on GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Token Generation Section */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-2 flex items-center gap-2">
              <Key className="w-5 h-5 text-violet-400" />
              CLI Authentication
            </h2>
            <p className="text-sm text-site-text-muted mb-6">
              Generate a token to link rmhcode with your RMH account, or use the browser login flow.
            </p>

            {isPending ? (
              <div className="h-12 w-full bg-site-surface-hover rounded-lg animate-pulse" />
            ) : session ? (
              <TokenGenerator />
            ) : (
              <div className="text-center py-8 border border-dashed border-site-border rounded-lg">
                <p className="text-site-text-muted mb-4">Sign in to generate a CLI token</p>
                <Link href="/login">
                  <Button variant="accent">
                    Sign In
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12"
        >
          <h2 className="text-xl font-semibold text-site-text mb-6">Features</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="p-5 rounded-xl border border-site-border bg-site-surface hover:border-violet-500/30 transition-colors"
              >
                <feature.icon className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="font-semibold text-site-text mb-1">{feature.title}</h3>
                <p className="text-sm text-site-text-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* User Builds Link */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12"
        >
          <Link href="/user-builds">
            <div className="p-6 rounded-xl border border-site-border bg-gradient-to-r from-violet-500/10 to-fuchsia-600/10 hover:border-violet-500/50 transition-colors group">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-site-text mb-1 flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-violet-400" />
                    Browse User Builds
                  </h2>
                  <p className="text-sm text-site-text-muted">
                    Explore projects created by the community with rmhcode
                  </p>
                </div>
                <ExternalLink className="w-5 h-5 text-site-text-muted group-hover:text-violet-400 transition-colors" />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* CLI Commands Reference */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12"
        >
          <h2 className="text-xl font-semibold text-site-text mb-6">CLI Commands</h2>
          <div className="rounded-xl border border-site-border bg-site-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-site-border bg-site-surface-hover">
                  <th className="text-left py-3 px-4 font-medium text-site-text">Command</th>
                  <th className="text-left py-3 px-4 font-medium text-site-text">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-site-border">
                <tr>
                  <td className="py-3 px-4 font-mono text-violet-400">rmhcode login</td>
                  <td className="py-3 px-4 text-site-text-muted">Authenticate with your RMH account</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-violet-400">rmhcode whoami</td>
                  <td className="py-3 px-4 text-site-text-muted">Show current authenticated user</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-violet-400">rmhcode push-build</td>
                  <td className="py-3 px-4 text-site-text-muted">Publish a project to User Builds</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-violet-400">rmhcode list-builds</td>
                  <td className="py-3 px-4 text-site-text-muted">List your published builds</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-violet-400">rmhcode logout</td>
                  <td className="py-3 px-4 text-site-text-muted">Sign out and remove stored token</td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
