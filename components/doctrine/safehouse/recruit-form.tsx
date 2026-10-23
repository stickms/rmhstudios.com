import { useState } from 'react';
import { Copy, Check, UserPlus } from 'lucide-react';
import { useTranslation } from "react-i18next";

export function RecruitForm() {
  const { t } = useTranslation("c-doctrine");
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
          {t("recruitment-link-generated", { defaultValue: "Recruitment Link Generated" })}
        </h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-white/60 bg-white/5 p-2 rounded truncate">
            {link}
          </code>
          <button type="button" onClick={copyLink} aria-label={copied ? t("link-copied", { defaultValue: "Link copied" }) : t("copy-link", { defaultValue: "Copy link" })} className="rounded hover:bg-white/10 transition-colors size-11 shrink-0 flex items-center justify-center">
            {copied ? <Check size={16} aria-hidden className="text-green-400" /> : <Copy size={16} aria-hidden className="text-white/60" />}
          </button>
        </div>
        <button
          onClick={() => { setCode(null); setMessage(''); }}
          className="text-sm md:text-xs text-white/60 hover:text-white/90 transition-colors min-h-11 md:min-h-0 flex items-center"
        >
          {t("generate-another", { defaultValue: "Generate another" })}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-lg" style={{ background: 'var(--doctrine-bg-secondary, #141416)' }}>
      <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
        <UserPlus size={16} style={{ color: 'var(--doctrine-accent, #F97316)' }} />
        {t("recruit-an-asset", { defaultValue: "Recruit an Asset" })}
      </h3>
      <textarea
        aria-label={t("recruitment-message-label", { defaultValue: "Recruitment message" })}
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={t("recruitment-message-placeholder", { defaultValue: "Write a personal recruitment message..." })}
        className="w-full h-28 md:h-24 text-base md:text-sm bg-white/5 border border-white/10 rounded-lg p-3 text-white/80 placeholder:text-white/50 resize-none focus:outline-none focus:border-white/20"
        maxLength={500}
      />
      <input
        aria-label={t("target-skills-label", { defaultValue: "Target skills" })}
        value={skills}
        onChange={e => setSkills(e.target.value)}
        placeholder={t("target-skills-placeholder", { defaultValue: "Target skills (comma-separated): frontend, design, music" })}
        className="w-full text-base md:text-sm bg-white/5 border border-white/10 rounded-lg p-3 md:p-2.5 text-white/80 placeholder:text-white/50 focus:outline-none focus:border-white/20 min-h-11"
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!message.trim() || loading}
        className="w-full py-3 md:py-2 text-base md:text-sm font-medium rounded-lg transition disabled:opacity-40 min-h-11"
        style={{ background: 'var(--doctrine-accent, #F97316)', color: '#000' }}
      >
        {loading ? t("generating", { defaultValue: "Generating..." }) : t("generate-recruitment-code", { defaultValue: "Generate Recruitment Code" })}
      </button>
    </div>
  );
}
