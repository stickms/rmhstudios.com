import { useState } from 'react';
import { Copy, Check, UserPlus } from 'lucide-react';

export function RecruitForm() {
  const [message, setMessage] = useState('');
  const [skills, setSkills] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!message.trim() || loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/doctrine/recruitment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalMessage: message,
          targetSkills: skills.split(',').map(s => s.trim()).filter(Boolean),
          maxUses: 5,
        }),
      });

      if (!res.ok) throw new Error('Failed to create code');
      const data = await res.json();
      setCode(data.code);
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!code) return;
    const link = `${window.location.origin}/strategies?recruit=${code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (code) {
    const link = `${window.location.origin}/strategies?recruit=${code}`;
    return (
      <div className="space-y-3 p-4 rounded-lg" style={{ background: 'var(--doctrine-bg-secondary, #141416)' }}>
        <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <UserPlus size={16} style={{ color: 'var(--doctrine-accent, #F97316)' }} />
          Recruitment Link Generated
        </h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-white/60 bg-white/5 p-2 rounded truncate">
            {link}
          </code>
          <button onClick={copyLink} className="p-2 rounded hover:bg-white/10 transition-colors">
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-white/40" />}
          </button>
        </div>
        <button
          onClick={() => { setCode(null); setMessage(''); }}
          className="text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          Generate another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-lg" style={{ background: 'var(--doctrine-bg-secondary, #141416)' }}>
      <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
        <UserPlus size={16} style={{ color: 'var(--doctrine-accent, #F97316)' }} />
        Recruit an Asset
      </h3>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Write a personal recruitment message..."
        className="w-full h-24 text-sm bg-white/5 border border-white/10 rounded-lg p-3 text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20"
        maxLength={500}
      />
      <input
        value={skills}
        onChange={e => setSkills(e.target.value)}
        placeholder="Target skills (comma-separated): frontend, design, music"
        className="w-full text-sm bg-white/5 border border-white/10 rounded-lg p-2.5 text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
      />
      <button
        onClick={handleGenerate}
        disabled={!message.trim() || loading}
        className="w-full py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40"
        style={{ background: 'var(--doctrine-accent, #F97316)', color: '#000' }}
      >
        {loading ? 'Generating...' : 'Generate Recruitment Code'}
      </button>
    </div>
  );
}
