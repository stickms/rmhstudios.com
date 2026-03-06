import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Terminal, Copy, Check, Key, ExternalLink, Boxes, Zap, Shield, GitBranch, ArrowLeft,
  Monitor, Download, ChevronDown, ChevronUp, Globe, Layers, Layout, FileText, Trash2, Package,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import TokenGenerator from '@/components/rmhcode/TokenGenerator';

const INSTALL_COMMAND_MAC = 'curl -fsSL https://raw.githubusercontent.com/ka1kqi/rmhcode/main/install.sh | bash';
const INSTALL_COMMAND_PS = 'irm https://raw.githubusercontent.com/ka1kqi/rmhcode/main/install.ps1 | iex';
const MANUAL_MAC = `git clone https://github.com/ka1kqi/rmhcode.git ~/.rmhcode
cd ~/.rmhcode && npm install
ln -s ~/.rmhcode/bin/rmhcode.mjs ~/.local/bin/rmhcode`;
const MANUAL_WIN = `git clone https://github.com/ka1kqi/rmhcode.git $env:USERPROFILE\\.rmhcode
cd $env:USERPROFILE\\.rmhcode; npm install`;
const UNINSTALL_MAC = 'rm -rf ~/.rmhcode ~/.local/bin/rmhcode';
const UNINSTALL_WIN = 'Remove-Item -Recurse ~\\.rmhcode, ~\\.local\\bin\\rmhcode.*';

const RELEASES_URL = 'https://github.com/ka1kqi/rmhcode/releases';

const inViewProps = {
  initial: { opacity: 0, y: 16 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true } as const,
  transition: { duration: 0.4 } as const,
};

function CopyButton({ text, id, copiedId, onCopy }: { text: string; id: string; copiedId: string | null; onCopy: (text: string, id: string) => void }) {
  return (
    <button
      onClick={() => onCopy(text, id)}
      className="absolute top-3 right-3 p-2 rounded-lg bg-site-surface hover:bg-site-surface-hover border border-site-border transition-colors"
      aria-label="Copy command"
    >
      {copiedId === id ? (
        <Check className="w-4 h-4 text-green-400" />
      ) : (
        <Copy className="w-4 h-4 text-site-text-muted" />
      )}
    </button>
  );
}

function CodeBlock({ code, id, copiedId, onCopy, className = '' }: { code: string; id: string; copiedId: string | null; onCopy: (text: string, id: string) => void; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <pre className="p-4 rounded-lg bg-site-bg border border-site-border overflow-x-auto text-sm text-site-text-muted font-mono">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} id={id} copiedId={copiedId} onCopy={onCopy} />
    </div>
  );
}

function RmhCodePage() {
  const { data: session, isPending } = useSession();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [installTab, setInstallTab] = useState<'mac' | 'windows' | 'binary'>('mac');
  const [showManualMac, setShowManualMac] = useState(false);
  const [showManualWin, setShowManualWin] = useState(false);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const features = [
    { icon: Zap, title: 'Multi-Provider AI Coding', description: 'Choose between Claude, OpenAI Codex, or Google Gemini as your coding backend.' },
    { icon: Boxes, title: 'User Builds Showcase', description: 'Publish your creations to the community showcase with a single command.' },
    { icon: Shield, title: 'RMH Account Integration', description: 'Sign in with your rmhstudios.com account via browser or token flow.' },
    { icon: GitBranch, title: 'GitHub Auto-Repo', description: 'Create a GitHub repo, push code, and publish a build in one step with --create-repo.' },
    { icon: Layout, title: 'Tmux Workspace', description: 'Launch a 3-pane tmux session with rmhcode and a shell, auto-installing tmux if needed.' },
    { icon: Layers, title: 'MCP Integrations', description: 'Bundled DeepWiki and GitHub MCP servers for docs and repo interaction.' },
  ];

  const binaries = [
    { platform: 'Linux', arch: 'x64', binary: 'rmhcode-linux-x64' },
    { platform: 'Linux', arch: 'ARM64', binary: 'rmhcode-linux-arm64' },
    { platform: 'macOS', arch: 'x64 (Intel)', binary: 'rmhcode-macos-x64' },
    { platform: 'macOS', arch: 'ARM64 (Apple Silicon)', binary: 'rmhcode-macos-arm64' },
    { platform: 'Windows', arch: 'x64', binary: 'rmhcode-win-x64.exe' },
  ];

  const providers = [
    { name: 'Claude (default)', flag: '--provider claude', requires: 'Included with rmhcode' },
    { name: 'OpenAI Codex', flag: '--provider codex', requires: 'npm install -g @openai/codex' },
    { name: 'Google Gemini', flag: '--provider gemini', requires: 'npm install -g @google/gemini-cli' },
  ];

  const cliCommands = [
    { command: 'rmhcode login', description: 'Authenticate with your RMH account (browser flow or --token)' },
    { command: 'rmhcode whoami', description: 'Show current authenticated user' },
    { command: 'rmhcode push-build', description: 'Publish a project to User Builds (interactive prompts)' },
    { command: 'rmhcode push-build --create-repo', description: 'Create a GitHub repo, push code, and publish in one step' },
    { command: 'rmhcode edit-build <slug>', description: 'Edit an existing build by its slug' },
    { command: 'rmhcode list-builds', description: 'Browse and manage your published builds (interactive menu)' },
    { command: 'rmhcode logout', description: 'Sign out and remove stored token' },
  ];

  const installTabs = [
    { key: 'mac' as const, label: 'macOS / Linux', icon: Terminal },
    { key: 'windows' as const, label: 'Windows', icon: Monitor },
    { key: 'binary' as const, label: 'Standalone Binaries', icon: Download },
  ];

  return (
    <div className="min-h-screen bg-site-bg relative">
      {/* Back Button */}
      <div className="absolute top-4 left-4 z-50">
        <Link to="/builds">
          <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm">
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="flex justify-center mb-8">
              <div className="relative w-64 h-80 md:w-80 md:h-[28rem] rounded-2xl overflow-hidden border border-violet-500/30 shadow-2xl shadow-violet-500/20">
                <img src="/images/games/rmhcode.png" alt="rmhcode" className="object-cover w-full h-full" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-site-text mb-4 font-(family-name:--site-font-display)">
              rmh<span className="text-violet-400">code</span>
            </h1>
            <p className="text-lg text-site-text-muted max-w-xl mx-auto mb-8">
              AI-powered coding assistant with RMH integrations. Build projects with Claude, Codex, or Gemini and publish to the User Builds showcase.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              Beta
            </div>
          </motion.div>

          {/* Install Section */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="max-w-2xl mx-auto">
            <div className="rounded-xl border border-site-border bg-site-surface/80 backdrop-blur-sm p-6">
              <h2 className="text-lg font-semibold text-site-text mb-2 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-violet-400" />
                Installation
              </h2>
              <p className="text-sm text-site-text-muted mb-4">
                Requires <span className="text-site-text font-medium">Node.js &gt;= 18</span> and <span className="text-site-text font-medium">npm</span>.{' '}
                <a href="https://github.com/ka1kqi/rmhcode" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
                  View on GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <div className="flex gap-2 mb-4 flex-wrap">
                {installTabs.map((tab) => (
                  <button key={tab.key} onClick={() => setInstallTab(tab.key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${installTab === tab.key ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-site-text-muted hover:text-site-text border border-transparent'}`}>
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
              {installTab === 'mac' && (
                <div className="space-y-3">
                  <p className="text-xs text-site-text-dim font-medium uppercase tracking-wide">One-liner (recommended)</p>
                  <CodeBlock code={INSTALL_COMMAND_MAC} id="install-mac" copiedId={copiedId} onCopy={copyToClipboard} />
                  <p className="text-xs text-site-text-dim">Note: may require an uninstall before reinstalling for updates.</p>
                  <button onClick={() => setShowManualMac(!showManualMac)} className="flex items-center gap-1.5 text-sm text-site-text-muted hover:text-site-text transition-colors">
                    {showManualMac ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Manual install
                  </button>
                  {showManualMac && <CodeBlock code={MANUAL_MAC} id="manual-mac" copiedId={copiedId} onCopy={copyToClipboard} />}
                </div>
              )}
              {installTab === 'windows' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-site-text-dim font-medium uppercase tracking-wide mb-2">Option 1: Installer (.exe)</p>
                    <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/30 transition-colors">
                      <Download className="w-4 h-4" /> Download from GitHub Releases
                    </a>
                    <p className="text-xs text-site-text-dim mt-1.5">Download the latest <code className="text-violet-400">rmhcode-*-setup-x64.exe</code></p>
                  </div>
                  <div>
                    <p className="text-xs text-site-text-dim font-medium uppercase tracking-wide mb-2">Option 2: PowerShell one-liner</p>
                    <CodeBlock code={INSTALL_COMMAND_PS} id="install-ps" copiedId={copiedId} onCopy={copyToClipboard} />
                  </div>
                  <div>
                    <button onClick={() => setShowManualWin(!showManualWin)} className="flex items-center gap-1.5 text-sm text-site-text-muted hover:text-site-text transition-colors">
                      {showManualWin ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      Option 3: Manual install
                    </button>
                    {showManualWin && (
                      <div className="mt-2 space-y-2">
                        <CodeBlock code={MANUAL_WIN} id="manual-win" copiedId={copiedId} onCopy={copyToClipboard} />
                        <p className="text-xs text-site-text-dim">Then add <code className="text-violet-400">%USERPROFILE%\.rmhcode\bin</code> to your PATH and create a <code className="text-violet-400">rmhcode.cmd</code> wrapper.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {installTab === 'binary' && (
                <div className="space-y-3">
                  <p className="text-sm text-site-text-muted">Pre-built binaries — no Node.js required. Download, make executable (<code className="text-violet-400">chmod +x</code> on Linux/macOS), and place in your PATH.</p>
                  <div className="rounded-lg border border-site-border bg-site-bg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-site-border bg-site-surface-hover"><th className="text-left py-2.5 px-3 font-medium text-site-text text-xs">Platform</th><th className="text-left py-2.5 px-3 font-medium text-site-text text-xs">Arch</th><th className="text-left py-2.5 px-3 font-medium text-site-text text-xs">Binary</th></tr></thead>
                      <tbody className="divide-y divide-site-border">
                        {binaries.map((b) => (<tr key={b.binary}><td className="py-2 px-3 text-site-text-muted">{b.platform}</td><td className="py-2 px-3 text-site-text-muted">{b.arch}</td><td className="py-2 px-3"><a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-violet-400 hover:text-violet-300 text-xs">{b.binary}</a></td></tr>))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-12">
        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-2 flex items-center gap-2"><Key className="w-5 h-5 text-violet-400" />CLI Authentication</h2>
            <p className="text-sm text-site-text-muted mb-6">Generate a token to link rmhcode with your RMH account, or use the browser login flow.</p>
            {isPending ? (<div className="h-12 w-full bg-site-surface-hover rounded-lg animate-pulse" />) : session ? (<TokenGenerator />) : (
              <div className="text-center py-8 border border-dashed border-site-border rounded-lg">
                <p className="text-site-text-muted mb-4">Sign in to generate a CLI token</p>
                <Link to="/login"><Button variant="accent">Sign In</Button></Link>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <h2 className="text-xl font-semibold text-site-text mb-6">Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <div key={feature.title} className="p-5 rounded-xl border border-site-border bg-site-surface hover:border-violet-500/30 transition-colors">
                <feature.icon className="w-6 h-6 text-violet-400 mb-3" />
                <h3 className="font-semibold text-site-text mb-1">{feature.title}</h3>
                <p className="text-sm text-site-text-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2"><Terminal className="w-5 h-5 text-violet-400" />Usage</h2>
            <CodeBlock code={`rmhcode              # launch with banner\nrmhcode --init       # generate a CLAUDE.md for your project\nrmhcode --tmux       # launch a 3-pane tmux workspace\nrmhcode --version    # show version\nrmhcode -p "prompt"  # print mode (no banner)\nrmhcode --no-banner  # suppress banner`} id="usage" copiedId={copiedId} onCopy={copyToClipboard} />
            <p className="text-sm text-site-text-dim mt-3">Set <code className="text-violet-400 text-xs">RMHCODE_NO_BANNER=1</code> to always suppress the banner. All standard Claude Code arguments and flags work as normal.</p>
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2"><Globe className="w-5 h-5 text-violet-400" />AI Providers</h2>
            <p className="text-sm text-site-text-muted mb-4">rmhcode supports multiple AI coding backends. By default, it uses Claude.</p>
            <div className="rounded-lg border border-site-border bg-site-bg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-site-border bg-site-surface-hover"><th className="text-left py-2.5 px-4 font-medium text-site-text">Provider</th><th className="text-left py-2.5 px-4 font-medium text-site-text">Flag</th><th className="text-left py-2.5 px-4 font-medium text-site-text">Requires</th></tr></thead>
                <tbody className="divide-y divide-site-border">
                  {providers.map((p) => (<tr key={p.name}><td className="py-2.5 px-4 text-site-text-muted">{p.name}</td><td className="py-2.5 px-4 font-mono text-violet-400 text-xs">{p.flag}</td><td className="py-2.5 px-4 font-mono text-site-text-dim text-xs">{p.requires}</td></tr>))}
                </tbody>
              </table>
            </div>
            <CodeBlock code={`rmhcode                          # Use Claude (default)\nrmhcode --provider codex         # Use Codex\nrmhcode --provider gemini        # Use Gemini`} id="providers" copiedId={copiedId} onCopy={copyToClipboard} />
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2"><Package className="w-5 h-5 text-violet-400" />RMH Builds Integration</h2>
            <p className="text-sm text-site-text-muted mb-6">Publish and manage projects on the{' '}<Link to="/user-builds" className="text-violet-400 hover:text-violet-300">User Builds</Link>{' '}showcase directly from the terminal.</p>
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-site-text mb-2">Authentication</h3>
              <p className="text-sm text-site-text-muted mb-3">Generate a token above, then use it with the CLI. Or use the browser-based flow:</p>
              <CodeBlock code={`rmhcode login --token YOUR_TOKEN   # token flow\nrmhcode login                      # browser flow`} id="auth" copiedId={copiedId} onCopy={copyToClipboard} />
            </div>
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-site-text mb-2">Auto-create GitHub Repo</h3>
              <p className="text-sm text-site-text-muted mb-3">Use <code className="text-violet-400">--create-repo</code> to create a GitHub repository, push your code, and publish — all in one step:</p>
              <CodeBlock code="rmhcode push-build --create-repo" id="create-repo" copiedId={copiedId} onCopy={copyToClipboard} />
              <p className="text-xs text-site-text-dim mt-2">Requires <code className="text-violet-400">GITHUB_PERSONAL_ACCESS_TOKEN</code> in your environment with the <code className="text-violet-400">repo</code> scope.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-site-text mb-2">Browsing & Editing Builds</h3>
              <CodeBlock code={`rmhcode list-builds              # interactive menu to browse your builds\nrmhcode edit-build my-project    # edit a build by its slug`} id="browse-edit" copiedId={copiedId} onCopy={copyToClipboard} />
            </div>
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2"><Layout className="w-5 h-5 text-violet-400" />Tmux Workspace</h2>
            <p className="text-sm text-site-text-muted mb-4">Launch a ready-made 3-pane tmux session:</p>
            <pre className="p-4 rounded-lg bg-site-bg border border-site-border font-mono text-xs text-violet-300 mb-4 overflow-x-auto">{`+──────────────+──────────────+\n|              |   rmhcode    |\n|   rmhcode    |   (top-R)    |\n|   (left)     +--------------+\n|              |   shell      |\n|              |   (bot-R)    |\n+──────────────+──────────────+`}</pre>
            <CodeBlock code={`rmhcode --tmux                    # launch workspace\nrmhcode --tmux --provider gemini  # all panes use Gemini`} id="tmux" copiedId={copiedId} onCopy={copyToClipboard} />
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-violet-400" />Auto-generate CLAUDE.md</h2>
            <p className="text-sm text-site-text-muted mb-4">Running <code className="text-violet-400">rmhcode --init</code> in any project directory scans your codebase and generates a <code className="text-violet-400">CLAUDE.md</code> file with:</p>
            <ul className="space-y-2 text-sm text-site-text-muted">
              {['Project name (from package.json, Cargo.toml, pyproject.toml, etc.)','Tech stack detection (frameworks, databases, testing tools, styling)','Directory structure with auto-detected purposes','Conventions (linting, formatting, TypeScript config)','Common tasks (extracted from package.json scripts)'].map((item) => (
                <li key={item} className="flex items-start gap-2"><Check className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />{item}</li>
              ))}
            </ul>
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-6">
            <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2"><Layers className="w-5 h-5 text-violet-400" />MCP Integrations</h2>
            <p className="text-sm text-site-text-muted mb-4">rmhcode comes with bundled MCP (Model Context Protocol) servers that are automatically configured during installation.</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-site-bg border border-site-border"><h3 className="font-semibold text-site-text mb-1">DeepWiki</h3><p className="text-sm text-site-text-muted">AI-powered documentation for any public GitHub repository.</p></div>
              <div className="p-4 rounded-lg bg-site-bg border border-site-border"><h3 className="font-semibold text-site-text mb-1">GitHub MCP</h3><p className="text-sm text-site-text-muted">Interact with GitHub issues, pull requests, and repositories directly from the CLI.</p></div>
            </div>
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <h2 className="text-xl font-semibold text-site-text mb-6">CLI Commands</h2>
          <div className="rounded-xl border border-site-border bg-site-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-site-border bg-site-surface-hover"><th className="text-left py-3 px-4 font-medium text-site-text">Command</th><th className="text-left py-3 px-4 font-medium text-site-text">Description</th></tr></thead>
              <tbody className="divide-y divide-site-border">
                {cliCommands.map((cmd) => (<tr key={cmd.command}><td className="py-3 px-4 font-mono text-violet-400 text-xs sm:text-sm whitespace-nowrap">{cmd.command}</td><td className="py-3 px-4 text-site-text-muted">{cmd.description}</td></tr>))}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div {...inViewProps}>
          <Link to="/user-builds">
            <div className="p-6 rounded-xl border border-site-border bg-gradient-to-r from-violet-500/10 to-fuchsia-600/10 hover:border-violet-500/50 transition-colors group">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-site-text mb-1 flex items-center gap-2"><Boxes className="w-5 h-5 text-violet-400" />Browse User Builds</h2>
                  <p className="text-sm text-site-text-muted">Explore projects created by the community with rmhcode</p>
                </div>
                <ExternalLink className="w-5 h-5 text-site-text-muted group-hover:text-violet-400 transition-colors" />
              </div>
            </div>
          </Link>
        </motion.div>

        <motion.div {...inViewProps}>
          <div className="rounded-xl border border-site-border bg-site-surface p-5">
            <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2"><Trash2 className="w-5 h-5 text-site-text-muted" />Uninstall</h2>
            <div className="space-y-4">
              <div><p className="text-xs text-site-text-dim font-medium uppercase tracking-wide mb-2">macOS / Linux</p><CodeBlock code={UNINSTALL_MAC} id="uninstall-mac" copiedId={copiedId} onCopy={copyToClipboard} /></div>
              <div><p className="text-xs text-site-text-dim font-medium uppercase tracking-wide mb-2">Windows (PowerShell install)</p><CodeBlock code={UNINSTALL_WIN} id="uninstall-win" copiedId={copiedId} onCopy={copyToClipboard} /></div>
              <p className="text-xs text-site-text-dim">Windows installer: Use Add/Remove Programs or run the uninstaller from the Start Menu.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_site/rmhcode/')({
  component: RmhCodePage,
});
