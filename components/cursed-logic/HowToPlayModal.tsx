'use client';

import { X } from 'lucide-react';

interface HowToPlayModalProps {
  open: boolean;
  onClose: () => void;
}

export function HowToPlayModal({ open, onClose }: HowToPlayModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
    >
      <div
        className="bg-[#0f0f14] border border-cyan-500/30 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl shadow-cyan-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex justify-between items-center p-4 border-b border-white/10 bg-[#0f0f14]/95">
          <h2 className="text-lg font-bold text-cyan-400 font-mono">How to Play</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 text-sm text-white/90">
          <p className="text-white/70">
            You duel the <strong className="text-amber-400">Protocol</strong> in simultaneous turns. Each round: choose a <strong>stance</strong>, then see the modifier, then <strong>commit</strong> an action (and optionally reinforce). Protocol and your move are revealed in sequence, then resolved.
          </p>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">Round flow</h3>
            <ol className="list-decimal list-inside space-y-1 text-white/80">
              <li><strong>Stance</strong> — Each round you get 3 random stances from a pool (e.g. Strike +1, Block negates chip, Prepare can’t fail). Pick one before the modifier.</li>
              <li><strong>Modifier</strong> — Rolled after stance; applies this round only.</li>
              <li><strong>Action</strong> — Pick an action. Optionally <strong>Reinforce</strong> (+1 Charge) to boost that action’s effect if you have 2+ Charge.</li>
              <li><strong>Reveal</strong> — Protocol’s move, then yours, then resolution.</li>
            </ol>
          </div>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">Resources</h3>
            <ul className="list-disc list-inside space-y-1 text-white/80">
              <li><strong>Charge</strong> — You spend <strong>1</strong> to act (or <strong>2</strong> to act + reinforce). Cap 5. +1 at the start of each round (unless a modifier says otherwise).</li>
              <li><strong>Integrity</strong> — Your health. If it hits 0, you lose.</li>
              <li><strong>Protocol health</strong> — Reduce it to 0 with Strikes to win.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">Actions</h3>
            <ul className="space-y-2 text-white/80">
              <li><strong className="text-cyan-300">Strike</strong> — Deal damage (1 base, 2 if you had Prepare). If they Block, they still take 1 chip damage.</li>
              <li><strong className="text-cyan-300">Block</strong> — Reduce incoming Strike to 1 chip damage (instead of full). Block is a resource, not a perfect counter.</li>
              <li><strong className="text-cyan-300">Prepare</strong> — Do nothing this round; next round your action is enhanced. <strong>Fails if the Protocol Strikes</strong>: you take full damage and get no buff. A read on the opponent.</li>
              <li><strong className="text-cyan-300">Probe</strong> — Reveal the Protocol’s intent for <strong>next round</strong> (not this one). Lets you plan ahead while keeping bluffing alive this round.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">Overdraw</h3>
            <p className="text-white/80">
              If you have 0 Charge and still choose an action, you overdraw: you take 1 extra damage (penalty) that round.
            </p>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">Protocol mode</h3>
            <p className="text-white/80">
              The Protocol has a visible <strong>mode</strong> that shifts each round: <strong>Pressuring</strong> (after it Strikes), <strong>Defensive</strong> (after it Blocks), <strong>Recovering</strong> (otherwise). Modes nudge its tendencies, not rules—use them to read it.
            </p>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">One-round conditions</h3>
            <p className="text-white/80 mb-1">
              After certain clashes, you or the Protocol get a <strong>condition</strong> for the next round only:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-white/80">
              <li><strong>Overextended</strong> (you) — You Struck into its Block; you take extra chip when you Block next.</li>
              <li><strong>Exposed</strong> (you) — You Prepared into its Strike; you take +1 damage when hit next round.</li>
              <li><strong>Shaken</strong> (Protocol) — It Struck into your Block; it takes extra chip when it Blocks next.</li>
              <li><strong>Locked In</strong> (Protocol) — It Prepared into your Strike; it takes +1 when you hit it next round.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">Modifiers</h3>
            <p className="text-white/80 mb-2">
              Each round there’s a chance a random modifier applies for that round only:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-white/80">
              <li><strong>Double Strike</strong> — Strikes deal 2.</li>
              <li><strong>No Block</strong> — Block doesn’t work.</li>
              <li><strong>Chaos</strong> — One side’s action (yours or the Protocol’s) is replaced at random.</li>
              <li><strong>Charge Drain</strong> — You gain 0 Charge this round.</li>
              <li><strong>Reveal</strong> — You see the Protocol’s intent before you choose.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">Win / Lose</h3>
            <p className="text-white/80">
              <strong>Win</strong> — Protocol health reaches 0.<br />
              <strong>Lose</strong> — Your Integrity reaches 0.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
