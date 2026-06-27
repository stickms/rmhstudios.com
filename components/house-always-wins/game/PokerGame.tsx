"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import {
  makeDeck,
  aiHold,
  drawReplacements,
  showdown,
  cardLabel,
  rankLabel,
  SUITS,
  SUIT_RED,
  HAND_NAMES,
  type Card,
  type Showdown,
} from "@/lib/house-always-wins/poker";

type Phase = "stake" | "draw" | "showdown";
const STAKES = [10, 25, 50];

function PlayingCard({
  card,
  faceDown,
  held,
  onClick,
  index,
}: {
  card: Card;
  faceDown?: boolean;
  held?: boolean;
  onClick?: () => void;
  index?: number;
}) {
  if (faceDown) {
    return (
      <div className="flex h-24 w-16 items-center justify-center rounded-md border border-[#3a2c1e] bg-[#1a1322] shadow-md">
        <div className="h-[84%] w-[80%] rounded border border-[#7a5e2a]/40 bg-[repeating-linear-gradient(45deg,#241a2e_0,#241a2e_4px,#1a1322_4px,#1a1322_8px)]" />
      </div>
    );
  }
  const red = SUIT_RED[card.suit];
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative flex h-24 w-16 flex-col justify-between rounded-md border bg-[#f4efe4] p-1.5 shadow-md transition-all ${
        onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"
      } ${held ? "-translate-y-2 border-[#d4a054] ring-2 ring-[#d4a054]" : "border-neutral-400"}`}
    >
      <span
        className={`text-left font-mono text-sm leading-none font-bold ${red ? "text-[#b3261e]" : "text-[#16181d]"}`}
      >
        {rankLabel(card.rank)}
        <br />
        {SUITS[card.suit]}
      </span>
      <span className={`text-center text-2xl leading-none ${red ? "text-[#b3261e]" : "text-[#16181d]"}`}>
        {SUITS[card.suit]}
      </span>
      <span
        className={`rotate-180 text-left font-mono text-sm leading-none font-bold ${red ? "text-[#b3261e]" : "text-[#16181d]"}`}
      >
        {rankLabel(card.rank)}
        <br />
        {SUITS[card.suit]}
      </span>
      {held && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-widest text-[#d4a054]">
          HELD
        </span>
      )}
      {index !== undefined && onClick && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[9px] text-[#6b6155]">
          [{index + 1}]
        </span>
      )}
    </button>
  );
}

export function PokerGame({ onClose }: { onClose: () => void }) {
  const debt = useHouseAlwaysWinsStore((s) => s.debt);
  const chips = useHouseAlwaysWinsStore((s) => s.chips);

  const [phase, setPhase] = useState<Phase>("stake");
  const [stake, setStake] = useState(10);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [aiHand, setAiHand] = useState<Card[]>([]);
  const [hold, setHold] = useState<boolean[]>([false, false, false, false, false]);
  const [result, setResult] = useState<Showdown | null>(null);
  const [settleMsg, setSettleMsg] = useState("");
  const deckRef = useRef<Card[]>([]);

  const deal = useCallback((s: number) => {
    const d = makeDeck();
    const p = [d.pop()!, d.pop()!, d.pop()!, d.pop()!, d.pop()!];
    const a = [d.pop()!, d.pop()!, d.pop()!, d.pop()!, d.pop()!];
    deckRef.current = d;
    setStake(s);
    setPlayerHand(p);
    setAiHand(a);
    setHold([false, false, false, false, false]);
    setResult(null);
    setSettleMsg("");
    setPhase("draw");
  }, []);

  const settle = useCallback((outcome: Showdown["outcome"], s: number) => {
    const st = useHouseAlwaysWinsStore.getState();
    if (outcome === "win") {
      const toDebt = Math.min(s, st.debt);
      if (toDebt > 0) st.addDebt(-toDebt);
      const leftover = s - toDebt;
      if (leftover > 0) st.addChips(leftover);
      setSettleMsg(
        toDebt > 0
          ? `You take the pot. Tab cut by ${toDebt}${leftover ? `, +${leftover} chips` : ""}.`
          : `You take the pot. +${s} chips.`
      );
    } else if (outcome === "lose") {
      const fromChips = Math.min(s, st.chips);
      if (fromChips > 0) st.spendChips(fromChips);
      const rem = s - fromChips;
      if (rem > 0) st.addDebt(rem);
      setSettleMsg(
        rem > 0
          ? `The house rakes it in. ${fromChips ? `−${fromChips} chips, ` : ""}tab up by ${rem}.`
          : `The house rakes it in. −${s} chips.`
      );
    } else {
      setSettleMsg("Split pot. Your stake comes back.");
    }
  }, []);

  const draw = useCallback(() => {
    const p2 = drawReplacements(playerHand, hold, deckRef.current);
    const aMask = aiHold(aiHand);
    const a2 = drawReplacements(aiHand, aMask, deckRef.current);
    const sd = showdown(p2, a2);
    setPlayerHand(p2);
    setAiHand(a2);
    setResult(sd);
    settle(sd.outcome, stake);
    setPhase("showdown");
  }, [playerHand, aiHand, hold, stake, settle]);

  const toggleHold = useCallback(
    (i: number) => {
      if (phase !== "draw") return;
      setHold((h) => h.map((v, idx) => (idx === i ? !v : v)));
    },
    [phase]
  );

  // keyboard: 1-5 hold, Enter/Space advance, Esc leave
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      e.stopPropagation();
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (phase === "draw") {
        const n = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].indexOf(e.code);
        if (n >= 0) {
          e.preventDefault();
          toggleHold(n);
        } else if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          draw();
        }
      } else if (phase === "stake") {
        const n = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
        if (n >= 0) {
          e.preventDefault();
          deal(STAKES[n]);
        }
      } else if (phase === "showdown") {
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          setPhase("stake");
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, toggleHold, draw, deal, onClose]);

  const outcomeColor =
    result?.outcome === "win" ? "#5fd2a0" : result?.outcome === "lose" ? "#c0392b" : "#d4a054";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/88 backdrop-blur-sm">
      <div className="w-[40rem] max-w-[94vw] rounded-2xl border border-[#2a2520] bg-[#0d0a10] p-6 shadow-2xl">
        {/* header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold tracking-wide text-[#f0c674]">Marlow's Table — Five-Card Draw</h2>
            <p className="font-mono text-[10px] tracking-widest text-[#6b6155] uppercase">
              Heads-up vs the House
            </p>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs">
            <span className="text-[#e7c95a]">Chips {chips}</span>
            <span className={debt > 0 ? "text-[#c0392b]" : "text-[#555]"}>Tab {debt}</span>
            <button onClick={onClose} className="text-[#6b6155] hover:text-[#cabba0]">
              ✕
            </button>
          </div>
        </div>

        {/* House hand */}
        <div className="mb-2 font-mono text-[10px] tracking-widest text-[#6b6155] uppercase">
          The House
        </div>
        <div className="mb-4 flex justify-center gap-2">
          {(phase === "showdown" ? aiHand : aiHand.length ? aiHand : Array(5).fill(null)).map(
            (c: Card | null, i) =>
              c && phase === "showdown" ? (
                <PlayingCard key={i} card={c} />
              ) : (
                <PlayingCard key={i} card={{ rank: 2, suit: 0 }} faceDown />
              )
          )}
        </div>

        {/* Player hand */}
        <div className="mb-2 mt-6 font-mono text-[10px] tracking-widest text-[#6b6155] uppercase">
          You {phase === "draw" && "— click cards to HOLD, then Draw"}
        </div>
        <div className="mb-2 flex min-h-[7rem] justify-center gap-2">
          {playerHand.length ? (
            playerHand.map((c, i) => (
              <PlayingCard
                key={i}
                card={c}
                held={hold[i]}
                index={i}
                onClick={phase === "draw" ? () => toggleHold(i) : undefined}
              />
            ))
          ) : (
            <div className="flex items-center font-mono text-sm text-[#6b6155]">
              Pick a stake to deal.
            </div>
          )}
        </div>

        {/* footer / controls */}
        <div className="mt-4 min-h-[3rem]">
          {phase === "stake" && (
            <div className="flex flex-col items-center gap-2">
              <p className="font-mono text-xs text-[#cabba0]">
                Wager against your tab. Win and it shrinks; lose and it grows.
              </p>
              <div className="flex gap-2">
                {STAKES.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => deal(s)}
                    className="rounded-lg border border-[#d4a054]/40 bg-[#d4a054]/10 px-4 py-2 font-mono text-sm text-[#f0c674] transition-colors hover:bg-[#d4a054]/20"
                  >
                    Stake {s} <span className="text-[#6b6155]">[{i + 1}]</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === "draw" && (
            <div className="flex justify-center">
              <button
                onClick={draw}
                className="rounded-lg border border-[#5fd2a0]/40 bg-[#5fd2a0]/10 px-6 py-2 font-mono text-sm text-[#5fd2a0] transition-colors hover:bg-[#5fd2a0]/20"
              >
                Draw &amp; Show [Enter]
              </button>
            </div>
          )}

          {phase === "showdown" && result && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3 font-mono text-sm">
                <span className="text-[#6b6155]">
                  {HAND_NAMES[result.playerValue.rank]} vs {HAND_NAMES[result.aiValue.rank]}
                </span>
              </div>
              <div className="text-lg font-bold tracking-wide" style={{ color: outcomeColor }}>
                {result.outcome === "win" ? "YOU WIN" : result.outcome === "lose" ? "HOUSE WINS" : "PUSH"}
              </div>
              <div className="font-mono text-xs text-[#cabba0]">{settleMsg}</div>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setPhase("stake")}
                  className="rounded-lg border border-[#d4a054]/40 bg-[#d4a054]/10 px-4 py-1.5 font-mono text-sm text-[#f0c674] hover:bg-[#d4a054]/20"
                >
                  Deal Again [Enter]
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-sm text-[#cabba0] hover:bg-white/10"
                >
                  Leave Table [Esc]
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 text-center font-mono text-[9px] text-[#3a342c]">
          {cardLabel({ rank: 14, suit: 0 })} The cards don&apos;t care who&apos;s desperate.
        </div>
      </div>
    </div>
  );
}
