'use client';

import { X } from 'lucide-react';
import { useTranslation } from "react-i18next";

interface HowToPlayModalProps {
  open: boolean;
  onClose: () => void;
}

export function HowToPlayModal({ open, onClose }: HowToPlayModalProps) {
  const { t } = useTranslation("c-cursed-logic");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("how-to-play-aria", { defaultValue: "How to play" })}
    >
      <div
        className="bg-[#0f0f14] border border-cyan-500/30 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl shadow-cyan-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex justify-between items-center p-4 border-b border-white/10 bg-[#0f0f14]/95">
          <h2 className="text-lg font-bold text-cyan-400 font-mono">{t("how-to-play-title", { defaultValue: "How to Play" })}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10"
            aria-label={t("close", { defaultValue: "Close" })}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 text-sm text-white/90">
          <p className="text-white/70">
            {t("intro", { defaultValue: "You duel the" })} <strong className="text-amber-400">{t("protocol-name", { defaultValue: "Protocol" })}</strong> {t("intro-rest", { defaultValue: "in simultaneous turns. Each round: choose a" })} <strong>{t("stance", { defaultValue: "stance" })}</strong>{t("intro-then-modifier", { defaultValue: ", then see the modifier, then" })} <strong>{t("commit", { defaultValue: "commit" })}</strong> {t("intro-commit-rest", { defaultValue: "an action (and optionally reinforce). Protocol and your move are revealed in sequence, then resolved." })}
          </p>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">{t("round-flow-heading", { defaultValue: "Round flow" })}</h3>
            <ol className="list-decimal list-inside space-y-1 text-white/80">
              <li><strong>{t("stance", { defaultValue: "stance" })}</strong> {t("round-flow-stance", { defaultValue: "— Each round you get 3 random stances from a pool (e.g. Strike +1, Block negates chip, Prepare can't fail). Pick one before the modifier." })}</li>
              <li><strong>{t("modifier-label", { defaultValue: "Modifier" })}</strong> {t("round-flow-modifier", { defaultValue: "— Rolled after stance; applies this round only." })}</li>
              <li><strong>{t("action-label", { defaultValue: "Action" })}</strong> {t("round-flow-action-prefix", { defaultValue: "— Pick an action. Optionally" })} <strong>{t("reinforce", { defaultValue: "Reinforce" })}</strong> {t("round-flow-action-suffix", { defaultValue: "(+1 Charge) to boost that action's effect if you have 2+ Charge." })}</li>
              <li><strong>{t("reveal-label", { defaultValue: "Reveal" })}</strong> {t("round-flow-reveal", { defaultValue: "— Protocol's move, then yours, then resolution." })}</li>
            </ol>
          </div>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">{t("resources-heading", { defaultValue: "Resources" })}</h3>
            <ul className="list-disc list-inside space-y-1 text-white/80">
              <li><strong>{t("charge", { defaultValue: "Charge" })}</strong> {t("resources-charge", { defaultValue: "— You spend" })} <strong>{t("one", { defaultValue: "1" })}</strong> {t("resources-charge-act", { defaultValue: "to act (or" })} <strong>{t("two", { defaultValue: "2" })}</strong> {t("resources-charge-reinforce", { defaultValue: "to act + reinforce). Cap 5. +1 at the start of each round (unless a modifier says otherwise)." })}</li>
              <li><strong>{t("integrity", { defaultValue: "Integrity" })}</strong> {t("resources-integrity", { defaultValue: "— Your health. If it hits 0, you lose." })}</li>
              <li><strong>{t("protocol-health", { defaultValue: "Protocol health" })}</strong> {t("resources-protocol-health", { defaultValue: "— Reduce it to 0 with Strikes to win." })}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">{t("actions-heading", { defaultValue: "Actions" })}</h3>
            <ul className="space-y-2 text-white/80">
              <li><strong className="text-cyan-300">{t("action-strike", { defaultValue: "Strike" })}</strong> {t("action-strike-desc", { defaultValue: "— Deal damage (1 base, 2 if you had Prepare). If they Block, they still take 1 chip damage." })}</li>
              <li><strong className="text-cyan-300">{t("action-block", { defaultValue: "Block" })}</strong> {t("action-block-desc", { defaultValue: "— Reduce incoming Strike to 1 chip damage (instead of full). Block is a resource, not a perfect counter." })}</li>
              <li><strong className="text-cyan-300">{t("action-prepare", { defaultValue: "Prepare" })}</strong> {t("action-prepare-desc-prefix", { defaultValue: "— Do nothing this round; next round your action is enhanced." })} <strong>{t("action-prepare-fails", { defaultValue: "Fails if the Protocol Strikes" })}</strong>{t("action-prepare-desc-suffix", { defaultValue: ": you take full damage and get no buff. A read on the opponent." })}</li>
              <li><strong className="text-cyan-300">{t("action-probe", { defaultValue: "Probe" })}</strong> {t("action-probe-desc-prefix", { defaultValue: "— Reveal the Protocol's intent for" })} <strong>{t("next-round", { defaultValue: "next round" })}</strong> {t("action-probe-desc-suffix", { defaultValue: "(not this one). Lets you plan ahead while keeping bluffing alive this round." })}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">{t("overdraw-heading", { defaultValue: "Overdraw" })}</h3>
            <p className="text-white/80">
              {t("overdraw-desc", { defaultValue: "If you have 0 Charge and still choose an action, you overdraw: you take 1 extra damage (penalty) that round." })}
            </p>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">{t("protocol-mode-heading", { defaultValue: "Protocol mode" })}</h3>
            <p className="text-white/80">
              {t("protocol-mode-desc-prefix", { defaultValue: "The Protocol has a visible" })} <strong>{t("mode", { defaultValue: "mode" })}</strong> {t("protocol-mode-desc-middle", { defaultValue: "that shifts each round:" })} <strong>{t("pressuring", { defaultValue: "Pressuring" })}</strong> {t("mode-pressuring-desc", { defaultValue: "(after it Strikes)," })} <strong>{t("defensive", { defaultValue: "Defensive" })}</strong> {t("mode-defensive-desc", { defaultValue: "(after it Blocks)," })} <strong>{t("recovering", { defaultValue: "Recovering" })}</strong> {t("protocol-mode-desc-suffix", { defaultValue: "(otherwise). Modes nudge its tendencies, not rules—use them to read it." })}
            </p>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">{t("conditions-heading", { defaultValue: "One-round conditions" })}</h3>
            <p className="text-white/80 mb-1">
              {t("conditions-desc", { defaultValue: "After certain clashes, you or the Protocol get a" })} <strong>{t("condition", { defaultValue: "condition" })}</strong> {t("conditions-desc-suffix", { defaultValue: "for the next round only:" })}
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-white/80">
              <li><strong>{t("overextended", { defaultValue: "Overextended" })}</strong> {t("overextended-desc", { defaultValue: "(you) — You Struck into its Block; you take extra chip when you Block next." })}</li>
              <li><strong>{t("exposed", { defaultValue: "Exposed" })}</strong> {t("exposed-desc", { defaultValue: "(you) — You Prepared into its Strike; you take +1 damage when hit next round." })}</li>
              <li><strong>{t("shaken", { defaultValue: "Shaken" })}</strong> {t("shaken-desc", { defaultValue: "(Protocol) — It Struck into your Block; it takes extra chip when it Blocks next." })}</li>
              <li><strong>{t("locked-in", { defaultValue: "Locked In" })}</strong> {t("locked-in-desc", { defaultValue: "(Protocol) — It Prepared into your Strike; it takes +1 when you hit it next round." })}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-amber-400 mb-2">{t("modifiers-heading", { defaultValue: "Modifiers" })}</h3>
            <p className="text-white/80 mb-2">
              {t("modifiers-desc", { defaultValue: "Each round there's a chance a random modifier applies for that round only:" })}
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-white/80">
              <li><strong>{t("mod-double-strike", { defaultValue: "Double Strike" })}</strong> {t("mod-double-strike-desc", { defaultValue: "— Strikes deal 2." })}</li>
              <li><strong>{t("mod-no-block", { defaultValue: "No Block" })}</strong> {t("mod-no-block-desc", { defaultValue: "— Block doesn't work." })}</li>
              <li><strong>{t("mod-chaos", { defaultValue: "Chaos" })}</strong> {t("mod-chaos-desc", { defaultValue: "— One side's action (yours or the Protocol's) is replaced at random." })}</li>
              <li><strong>{t("mod-charge-drain", { defaultValue: "Charge Drain" })}</strong> {t("mod-charge-drain-desc", { defaultValue: "— You gain 0 Charge this round." })}</li>
              <li><strong>{t("mod-reveal", { defaultValue: "Reveal" })}</strong> {t("mod-reveal-desc", { defaultValue: "— You see the Protocol's intent before you choose." })}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono font-bold text-cyan-400 mb-2">{t("win-lose-heading", { defaultValue: "Win / Lose" })}</h3>
            <p className="text-white/80">
              <strong>{t("win", { defaultValue: "Win" })}</strong> {t("win-desc", { defaultValue: "— Protocol health reaches 0." })}<br />
              <strong>{t("lose", { defaultValue: "Lose" })}</strong> {t("lose-desc", { defaultValue: "— Your Integrity reaches 0." })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
