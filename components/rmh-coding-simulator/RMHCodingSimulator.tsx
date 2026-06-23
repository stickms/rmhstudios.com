'use client';

import './rmh-coding-simulator.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  createInitialState,
  type GoldenResult,
} from '@/lib/rmh-coding-simulator/store';
import {
  GENERATORS,
  UPGRADES,
  SKILLS,
  PERKS,
  ACHIEVEMENTS,
  ACHIEVEMENT_MAP,
  ASCEND_MIN_REPUTATION,
} from '@/lib/rmh-coding-simulator/data';
import {
  totalCps,
  clickPower,
  generatorBulkCost,
  generatorUnitCps,
  resolveBuyCount,
  permanentMultiplier,
  pendingReputation,
  pendingEquity,
} from '@/lib/rmh-coding-simulator/engine';
import { fmt, fmtRate, fmtInt, formatDuration } from '@/lib/rmh-coding-simulator/numbers';
import {
  loadFromLocalStorage,
  applySaveToState,
  saveToLocalStorage,
  computeOffline,
  exportSave,
  importSave,
  clearLocalSave,
} from '@/lib/rmh-coding-simulator/persistence';
import { askArchitect, generateSprintGoal } from '@/lib/rmh-coding-simulator/ai';
import type { GameState, NumberFormat, BuyQty, TabId } from '@/lib/rmh-coding-simulator/types';

// ─── Root ─────────────────────────────────────────────────────────────────────

export function RMHCodingSimulator() {
  const [ready, setReady] = useState(false);
  const loadState = useGameStore((s) => s.loadState);
  const setOfflineFlash = useGameStore((s) => s.setOfflineFlash);

  // Load save + offline catch-up, once.
  useEffect(() => {
    const save = loadFromLocalStorage();
    if (save) {
      const base = createInitialState();
      const partial = applySaveToState(save, base);
      loadState(partial);
      // Compute offline against the freshly-loaded state.
      const merged = { ...base, ...partial } as GameState;
      const { loc, seconds } = computeOffline(merged, Date.now());
      if (loc > 0) setOfflineFlash(loc, seconds);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="rcs-loading">
        <div className="rcs-spin" />
        <p className="rcs-mono">booting RMH Coding Simulator…</p>
      </div>
    );
  }

  return <Game />;
}

// ─── Game loop + layout ─────────────────────────────────────────────────────

function Game() {
  const activeTab = useGameStore((s) => s.activeTab);
  const setTab = useGameStore((s) => s.setTab);

  // Achievement pop notifications.
  const [pops, setPops] = useState<string[]>([]);

  // ── Tick loop (10 Hz) ──
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      useGameStore.getState().tick(dt);
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  // ── Achievement audit (every 2s) ──
  useEffect(() => {
    const id = window.setInterval(() => {
      const newly = useGameStore.getState().auditAchievements();
      if (newly.length) setPops((p) => [...p, ...newly]);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  // ── Auto-save (every 15s + on hide/unload) ──
  useEffect(() => {
    const save = () => saveToLocalStorage(useGameStore.getState());
    const id = window.setInterval(save, 15_000);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', save);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', save);
      save();
    };
  }, []);

  // Auto-dismiss achievement pops.
  useEffect(() => {
    if (!pops.length) return;
    const id = window.setTimeout(() => setPops((p) => p.slice(1)), 3500);
    return () => window.clearTimeout(id);
  }, [pops]);

  return (
    <div className="rcs-root">
      <TopBar />
      <div className="rcs-body">
        <ClickPanel />
        <div className="rcs-right">
          <nav className="rcs-tabs">
            {(
              [
                ['studio', '👩‍💻 Studio'],
                ['upgrades', '⬆️ Upgrades'],
                ['prestige', '🚀 Prestige'],
                ['archlab', '🤖 AI Architect'],
                ['stats', '📊 Stats'],
              ] as [TabId, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                className={`rcs-tab ${activeTab === id ? 'is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="rcs-scroll">
            {activeTab === 'studio' && <StudioTab />}
            {activeTab === 'upgrades' && <UpgradesTab />}
            {activeTab === 'prestige' && <PrestigeTab />}
            {activeTab === 'archlab' && <ArchLabTab />}
            {activeTab === 'stats' && <StatsTab />}
          </div>
        </div>
      </div>

      <OfflineModal />

      {pops.length > 0 && (
        <div className="rcs-ach-pop">
          {pops.slice(0, 3).map((id, i) => {
            const a = ACHIEVEMENT_MAP[id];
            if (!a) return null;
            return (
              <div className="rcs-ach-pop__item" key={`${id}-${i}`}>
                <span style={{ fontSize: '1.6rem' }}>{a.emoji}</span>
                <div>
                  <b>{a.name}</b>
                  <br />
                  <span>Achievement unlocked!</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

function TopBar() {
  const loc = useGameStore((s) => s.loc);
  const reputation = useGameStore((s) => s.reputation);
  const equity = useGameStore((s) => s.equity);
  const fmtMode = useGameStore((s) => s.numberFormat);
  const cps = useStoreCps();

  return (
    <header className="rcs-topbar">
      <a href="/builds" className="rcs-back">← Builds</a>
      <div className="rcs-brand">
        <span style={{ fontSize: '1.3rem' }}>⌨️</span>
        RMH Coding Simulator <small className="rcs-mono">v1.0</small>
      </div>
      <div className="rcs-counters">
        <div className="rcs-counter rcs-counter--loc">
          <b className="rcs-mono">{fmt(loc, fmtMode)}</b>
          <span>Lines of Code · {fmtRate(cps, fmtMode)}</span>
        </div>
        {reputation > 0 && (
          <div className="rcs-counter rcs-counter--rep">
            <b className="rcs-mono">⭐ {fmt(reputation, fmtMode)}</b>
            <span>Reputation</span>
          </div>
        )}
        {equity > 0 && (
          <div className="rcs-counter rcs-counter--eq">
            <b className="rcs-mono">📈 {fmt(equity, fmtMode)}</b>
            <span>Equity</span>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Click panel (left) ──────────────────────────────────────────────────────

interface Float { id: number; x: number; y: number; text: string; }

function ClickPanel() {
  const click = useGameStore((s) => s.click);
  const clickGolden = useGameStore((s) => s.clickGolden);
  const golden = useGameStore((s) => s.golden);
  const buffs = useGameStore((s) => s.activeBuffs);
  const fmtMode = useGameStore((s) => s.numberFormat);
  const cps = useStoreCps();
  const clickVal = useStoreClick();

  const [floats, setFloats] = useState<Float[]>([]);
  const [toast, setToast] = useState<GoldenResult | null>(null);
  const seq = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      click();
      const rect = panelRef.current?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : e.nativeEvent.offsetX;
      const y = rect ? e.clientY - rect.top : e.nativeEvent.offsetY;
      const id = ++seq.current;
      const text = `+${fmt(useGameStore.getState().getClick(), fmtMode)}`;
      setFloats((f) => [...f, { id, x, y, text }]);
      window.setTimeout(() => setFloats((f) => f.filter((fl) => fl.id !== id)), 900);
    },
    [click, fmtMode],
  );

  const onGolden = useCallback(() => {
    const res = clickGolden();
    if (res) {
      setToast(res);
      window.setTimeout(() => setToast(null), 2600);
    }
  }, [clickGolden]);

  return (
    <div className="rcs-left" ref={panelRef}>
      <div className="rcs-rate">
        <b className="rcs-mono">{fmtRate(cps, fmtMode)}</b>
        <span>Lines of Code per second</span>
        <small className="rcs-mono">+{fmt(clickVal, fmtMode)} per click</small>
      </div>

      <button className="rcs-clicker" onClick={onClick} aria-label="Write code">
        <span className="rcs-clicker__emoji">👨‍💻</span>
        <span className="rcs-clicker__label rcs-mono">git commit</span>
        <span className="rcs-clicker__hint">click to write code</span>
      </button>

      {buffs.length > 0 && (
        <div className="rcs-buffs">
          {buffs.map((b) => (
            <span key={b.uid} className={`rcs-buff ${b.cpsMult < 1 ? 'rcs-buff--bad' : ''}`}>
              {b.emoji} {b.name} <small className="rcs-mono">{Math.ceil(b.remaining)}s</small>
            </span>
          ))}
        </div>
      )}

      {floats.map((f) => (
        <span key={f.id} className="rcs-float rcs-mono" style={{ left: f.x, top: f.y }}>
          {f.text}
        </span>
      ))}

      {golden && (
        <button
          className="rcs-golden"
          style={{ left: `${golden.x}%`, top: `${golden.y}%` }}
          onClick={onGolden}
          aria-label="Golden commit"
          title="A Golden Commit! Click it!"
        >
          ✨
        </button>
      )}

      {toast && (
        <div className={`rcs-toast ${toast.kind === 'buildFail' ? 'rcs-toast--bad' : ''}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Studio tab (generators) ──────────────────────────────────────────────────

function StudioTab() {
  const loc = useGameStore((s) => s.loc);
  const generators = useGameStore((s) => s.generators);
  const buyQty = useGameStore((s) => s.buyQty);
  const buyGenerator = useGameStore((s) => s.buyGenerator);
  const setBuyQty = useGameStore((s) => s.setBuyQty);
  const fmtMode = useGameStore((s) => s.numberFormat);
  const snapshot = useGameStore.getState();

  // A generator is visible once you can afford ~half of it, or already own it.
  const cheapestUnowned = GENERATORS.find((g) => (generators[g.id] ?? 0) === 0 && loc < g.baseCost * 0.5);

  return (
    <div>
      <div className="rcs-qty">
        {([1, 10, 100, 'max'] as BuyQty[]).map((q) => (
          <button
            key={String(q)}
            className={buyQty === q ? 'is-active' : ''}
            onClick={() => setBuyQty(q)}
          >
            {q === 'max' ? 'MAX' : `×${q}`}
          </button>
        ))}
      </div>

      {GENERATORS.map((g) => {
        const owned = generators[g.id] ?? 0;
        // Hide generators well beyond reach to preserve the sense of discovery.
        if (owned === 0 && cheapestUnowned && g.baseCost > cheapestUnowned.baseCost * 12) return null;

        const n = resolveBuyCount(snapshot, g.id);
        const count = buyQty === 'max' ? Math.max(1, n) : n;
        const cost = generatorBulkCost(g.id, owned, count);
        const afford = loc >= cost && count > 0;
        const unitCps = generatorUnitCps(snapshot, g.id) * permanentMultiplier(snapshot);

        return (
          <button
            key={g.id}
            className="rcs-item"
            disabled={!afford}
            onClick={() => buyGenerator(g.id)}
          >
            <span className="rcs-item__emoji">{g.emoji}</span>
            <span className="rcs-item__body">
              <span className="rcs-item__name">
                {g.name}
                {owned > 0 && <span className="rcs-item__count rcs-mono">×{fmtInt(owned)}</span>}
              </span>
              <span className="rcs-item__blurb">{g.blurb}</span>
              {owned > 0 && (
                <span className="rcs-item__blurb rcs-mono">
                  each: {fmtRate(unitCps, fmtMode)} · line: {fmtRate(unitCps * owned, fmtMode)}
                </span>
              )}
            </span>
            <span className="rcs-item__right">
              <span className={`rcs-item__cost rcs-mono ${afford ? 'is-afford' : ''}`}>
                {fmt(cost, fmtMode)}
              </span>
              <span className="rcs-item__sub">buy {buyQty === 'max' ? `×${fmtInt(count)}` : `×${count}`}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Upgrades tab ──────────────────────────────────────────────────────────────

function UpgradesTab() {
  const loc = useGameStore((s) => s.loc);
  const lifetimeLoc = useGameStore((s) => s.lifetimeLoc);
  const generators = useGameStore((s) => s.generators);
  const purchased = useGameStore((s) => s.upgrades);
  const buyUpgrade = useGameStore((s) => s.buyUpgrade);
  const fmtMode = useGameStore((s) => s.numberFormat);

  const owned = new Set(purchased);
  const available = UPGRADES.filter((u) => {
    if (owned.has(u.id)) return false;
    if (u.requiresGen && (generators[u.requiresGen.genId] ?? 0) < u.requiresGen.count) return false;
    if (u.requiresLifetime && lifetimeLoc < u.requiresLifetime) return false;
    return true;
  }).sort((a, b) => a.cost - b.cost);

  return (
    <div>
      <p className="rcs-section-title">
        Available upgrades · {available.length} ready · {purchased.length} purchased
      </p>
      {available.length === 0 && (
        <p className="rcs-empty">
          No upgrades available yet. Hire more developers and write more code to unlock them. 🔧
        </p>
      )}
      {available.slice(0, 60).map((u) => {
        const afford = loc >= u.cost;
        return (
          <button key={u.id} className="rcs-item" disabled={!afford} onClick={() => buyUpgrade(u.id)}>
            <span className="rcs-item__emoji">{u.emoji}</span>
            <span className="rcs-item__body">
              <span className="rcs-item__name">{u.name}</span>
              <span className="rcs-item__blurb">{u.desc}</span>
            </span>
            <span className="rcs-item__right">
              <span className={`rcs-item__cost rcs-mono ${afford ? 'is-afford' : ''}`}>
                {fmt(u.cost, fmtMode)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Prestige tab ──────────────────────────────────────────────────────────────

function PrestigeTab() {
  const fmtMode = useGameStore((s) => s.numberFormat);
  const reputation = useGameStore((s) => s.reputation);
  const reputationEarned = useGameStore((s) => s.reputationEarned);
  const equity = useGameStore((s) => s.equity);
  const lifetimeLoc = useGameStore((s) => s.lifetimeLoc);
  const skills = useGameStore((s) => s.skills);
  const perks = useGameStore((s) => s.perks);
  const ship = useGameStore((s) => s.ship);
  const ascend = useGameStore((s) => s.ascend);
  const buySkill = useGameStore((s) => s.buySkill);
  const buyPerk = useGameStore((s) => s.buyPerk);

  const repGain = pendingReputation({ lifetimeLoc, reputationEarned } as GameState);
  const eqGain = pendingEquity({ reputationEarned, equityEarned: useGameStore.getState().equityEarned } as GameState);
  const canAscend = reputationEarned >= ASCEND_MIN_REPUTATION;

  const ownedSkills = new Set(skills);
  const ownedPerks = new Set(perks);
  const skillTiers = Array.from(new Set(SKILLS.map((s) => s.tier))).sort((a, b) => a - b);

  return (
    <div>
      {/* Ship It */}
      <div className="rcs-prestige-card">
        <h3>🚀 Ship a Product</h3>
        <p>
          Reset your code, developers and upgrades to ship a release. You keep Reputation, skills and
          achievements. Reputation gives <b>+2% production each</b>, permanently (this studio era).
        </p>
        <div className="rcs-settings-row">
          <span className="rcs-prestige-gain rcs-mono" style={{ color: 'var(--rcs-gold)' }}>
            +{fmt(repGain, fmtMode)} ⭐
          </span>
          <button className="rcs-btn rcs-btn--ship" disabled={repGain <= 0} onClick={ship}>
            Ship It!
          </button>
        </div>
        {repGain <= 0 && (
          <p style={{ margin: 0 }}>
            Reach <b>1M lifetime LoC</b> this run to earn your first Reputation. (Currently {fmt(lifetimeLoc, fmtMode)}.)
          </p>
        )}
      </div>

      {/* IPO / Ascend */}
      <div className="rcs-prestige-card" style={{ borderColor: canAscend ? 'var(--rcs-purple)' : undefined }}>
        <h3>📈 Take the Studio Public (IPO)</h3>
        <p>
          The deep reset. Trade <b>all</b> Reputation &amp; skills for permanent <b>Equity</b> — each Equity
          gives <b>+50% production forever</b> and unlocks Founder Perks that survive every future reset.
        </p>
        <div className="rcs-settings-row">
          <span className="rcs-prestige-gain rcs-mono" style={{ color: 'var(--rcs-purple)' }}>
            +{fmt(eqGain, fmtMode)} 📈
          </span>
          <button className="rcs-btn rcs-btn--ascend" disabled={eqGain <= 0} onClick={ascend}>
            Ring the Bell
          </button>
        </div>
        {!canAscend && (
          <p style={{ margin: 0 }}>
            Earn <b>{ASCEND_MIN_REPUTATION} Reputation</b> in this era to unlock the IPO. (Earned so far:{' '}
            {fmt(reputationEarned, fmtMode)}.)
          </p>
        )}
      </div>

      {/* Skill tree */}
      <p className="rcs-section-title">Reputation Skill Tree · spend ⭐ {fmt(reputation, fmtMode)}</p>
      {skillTiers.map((tier) => (
        <div key={tier} style={{ marginBottom: '0.75rem' }}>
          <div className="rcs-tree">
            {SKILLS.filter((s) => s.tier === tier).map((sk) => {
              const isOwned = ownedSkills.has(sk.id);
              const reqMet = !sk.requires || sk.requires.every((r) => ownedSkills.has(r));
              const locked = !reqMet;
              const afford = reputation >= sk.cost;
              return (
                <button
                  key={sk.id}
                  className={`rcs-node ${isOwned ? 'is-owned' : ''} ${locked ? 'is-locked' : ''}`}
                  disabled={isOwned || locked || !afford}
                  onClick={() => buySkill(sk.id)}
                  title={locked ? 'Requires a prerequisite skill' : ''}
                >
                  <span className="rcs-node__name">{sk.emoji} {sk.name}</span>
                  <span className="rcs-node__desc">{sk.desc}</span>
                  <span className="rcs-node__cost rcs-mono">{isOwned ? '✓ Owned' : `⭐ ${sk.cost}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Perks (only once you have equity) */}
      {(equity > 0 || perks.length > 0) && (
        <>
          <p className="rcs-section-title">Founder Perks · spend 📈 {fmt(equity, fmtMode)}</p>
          <div className="rcs-tree">
            {PERKS.map((p) => {
              const isOwned = ownedPerks.has(p.id);
              const reqMet = !p.requires || p.requires.every((r) => ownedPerks.has(r));
              const locked = !reqMet;
              const afford = equity >= p.cost;
              return (
                <button
                  key={p.id}
                  className={`rcs-node ${isOwned ? 'is-owned' : ''} ${locked ? 'is-locked' : ''}`}
                  disabled={isOwned || locked || !afford}
                  onClick={() => buyPerk(p.id)}
                >
                  <span className="rcs-node__name">{p.emoji} {p.name}</span>
                  <span className="rcs-node__desc">{p.desc}</span>
                  <span className="rcs-node__cost rcs-mono">{isOwned ? '✓ Owned' : `📈 ${p.cost}`}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── AI Architect tab ───────────────────────────────────────────────────────

function ArchLabTab() {
  const chat = useGameStore((s) => s.chat);
  const pushChat = useGameStore((s) => s.pushChat);
  const bumpAiCalls = useGameStore((s) => s.bumpAiCalls);
  const startSprint = useGameStore((s) => s.startSprint);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, busy]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    pushChat('user', text);
    bumpAiCalls();
    setBusy(true);
    try {
      const history = [...useGameStore.getState().chat];
      const reply = await askArchitect(history);
      pushChat('assistant', reply);
    } finally {
      setBusy(false);
    }
  }, [input, busy, pushChat, bumpAiCalls]);

  const sprint = useCallback(async () => {
    if (busy) return;
    bumpAiCalls();
    setBusy(true);
    try {
      const goal = await generateSprintGoal();
      startSprint(goal);
    } finally {
      setBusy(false);
    }
  }, [busy, bumpAiCalls, startSprint]);

  return (
    <div className="rcs-chat" style={{ height: 'calc(100% - 0px)' }}>
      <div className="rcs-chat__tools">
        <button className="rcs-btn rcs-btn--ghost" onClick={sprint} disabled={busy}>
          🏃 Generate Sprint (×3 buff)
        </button>
      </div>
      <div className="rcs-chat__log" ref={logRef}>
        {chat.length === 0 && (
          <div className="rcs-msg rcs-msg--assistant">
            <div className="rcs-msg__who">ARCH-1</div>
            Hey, I&apos;m ARCH-1, principal architect at RMH. Ask me anything about shipping code — or
            hit <b>Generate Sprint</b> for a temporary ×3 production buff. Now stop reading and go commit
            something. 🦆
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`rcs-msg rcs-msg--${m.role === 'user' ? 'user' : 'assistant'}`}>
            <div className="rcs-msg__who">{m.role === 'user' ? 'You' : 'ARCH-1'}</div>
            {m.content}
          </div>
        ))}
        {busy && <div className="rcs-typing rcs-mono">ARCH-1 is typing…</div>}
      </div>
      <form
        className="rcs-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="rcs-chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the AI Architect…"
          maxLength={500}
          disabled={busy}
        />
        <button type="submit" className="rcs-btn rcs-chat__send" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

// ─── Stats tab ─────────────────────────────────────────────────────────────────

function StatsTab() {
  const s = useGameStore();
  const fmtMode = s.numberFormat;
  const setNumberFormat = useGameStore((st) => st.setNumberFormat);
  const hardReset = useGameStore((st) => st.hardReset);
  const loadState = useGameStore((st) => st.loadState);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');

  const stats: [string, string][] = [
    ['Lines of Code', fmt(s.loc, fmtMode)],
    ['LoC / sec', fmt(totalCps(s), fmtMode)],
    ['Per click', fmt(clickPower(s), fmtMode)],
    ['All-time LoC', fmt(s.totalLoc, fmtMode)],
    ['Production ×', fmt(permanentMultiplier(s), fmtMode)],
    ['Total clicks', fmtInt(s.totalClicks)],
    ['Hand-written LoC', fmt(s.handmadeLoc, fmtMode)],
    ['Golden Commits', fmtInt(s.goldenClicks)],
    ['Products shipped', fmtInt(s.shipCount)],
    ['IPOs', fmtInt(s.ascensionCount)],
    ['Reputation earned', fmt(s.reputationEarned, fmtMode)],
    ['Equity earned', fmt(s.equityEarned, fmtMode)],
    ['AI consults', fmtInt(s.aiCalls)],
    ['Playtime', formatDuration(s.playtime)],
    ['Achievements', `${s.achievements.length} / ${ACHIEVEMENTS.length}`],
  ];

  const doExport = () => {
    const code = exportSave(useGameStore.getState());
    navigator.clipboard?.writeText(code).then(
      () => setMsg('Save copied to clipboard!'),
      () => setMsg('Copy failed — select the box below to copy manually.'),
    );
    setImportText(code);
  };

  const doImport = () => {
    const save = importSave(importText);
    if (!save) {
      setMsg('Invalid save code.');
      return;
    }
    loadState(applySaveToState(save, createInitialState()));
    setMsg('Save imported!');
  };

  const doReset = () => {
    if (!window.confirm('Hard reset? This wipes EVERYTHING — no undo.')) return;
    clearLocalSave();
    hardReset();
    setMsg('Game reset.');
  };

  return (
    <div>
      <p className="rcs-section-title">Statistics</p>
      <div className="rcs-stats">
        {stats.map(([label, val]) => (
          <div className="rcs-stat" key={label}>
            <b className="rcs-mono">{val}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <p className="rcs-section-title">Achievements · {s.achievements.length}/{ACHIEVEMENTS.length}</p>
      <div className="rcs-ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const earned = s.achievements.includes(a.id);
          return (
            <div key={a.id} className={`rcs-ach ${earned ? 'is-earned' : ''}`}>
              <div className="rcs-ach__top">
                <span>{a.emoji}</span> {a.name}
              </div>
              <div className="rcs-ach__desc">{a.desc}</div>
            </div>
          );
        })}
      </div>

      <p className="rcs-section-title" style={{ marginTop: '1.25rem' }}>Settings</p>
      <div className="rcs-settings-row">
        <span style={{ fontSize: '0.85rem' }}>Number format:</span>
        {(['short', 'scientific'] as NumberFormat[]).map((f) => (
          <button
            key={f}
            className={`rcs-btn ${fmtMode === f ? '' : 'rcs-btn--ghost'}`}
            style={fmtMode === f ? { background: 'var(--rcs-green)', color: 'var(--rcs-bg)' } : undefined}
            onClick={() => setNumberFormat(f)}
          >
            {f === 'short' ? '1.23M' : '1.23e6'}
          </button>
        ))}
      </div>

      <div className="rcs-settings-row">
        <button className="rcs-btn rcs-btn--ghost" onClick={doExport}>📋 Export save</button>
        <button className="rcs-btn rcs-btn--ghost" onClick={doImport}>📥 Import save</button>
        <button className="rcs-btn rcs-btn--ghost" style={{ color: 'var(--rcs-red)' }} onClick={doReset}>
          ⚠️ Hard reset
        </button>
      </div>
      <textarea
        className="rcs-textarea"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        placeholder="Paste a save code here, then press Import…"
      />
      {msg && <p style={{ color: 'var(--rcs-green)', fontSize: '0.85rem' }}>{msg}</p>}
    </div>
  );
}

// ─── Offline modal ─────────────────────────────────────────────────────────────

function OfflineModal() {
  const offlineLoc = useGameStore((s) => s.offlineLocOnLoad);
  const offlineSeconds = useGameStore((s) => s.offlineSecondsOnLoad);
  const fmtMode = useGameStore((s) => s.numberFormat);
  const clear = useGameStore((s) => s.clearOfflineFlash);

  if (offlineLoc <= 0) return null;
  return (
    <div className="rcs-modal-backdrop" onClick={clear}>
      <div className="rcs-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Welcome back! 👋</h2>
        <p>
          Your studio kept shipping for <b>{formatDuration(offlineSeconds)}</b> while you were away.
        </p>
        <p style={{ fontSize: '1.4rem', color: 'var(--rcs-green)' }} className="rcs-mono">
          +{fmt(offlineLoc, fmtMode)} LoC
        </p>
        <button className="rcs-btn rcs-btn--ship" onClick={clear}>Collect</button>
      </div>
    </div>
  );
}

// ─── Small reactive derived hooks ───────────────────────────────────────────
// These recompute each render off the slices they depend on, so the numbers in
// the UI stay live as the 10 Hz tick mutates the store.

function useStoreCps(): number {
  const generators = useGameStore((s) => s.generators);
  const upgrades = useGameStore((s) => s.upgrades);
  const skills = useGameStore((s) => s.skills);
  const perks = useGameStore((s) => s.perks);
  const achievements = useGameStore((s) => s.achievements);
  const repEarned = useGameStore((s) => s.reputationEarned);
  const eqEarned = useGameStore((s) => s.equityEarned);
  const buffs = useGameStore((s) => s.activeBuffs);
  void generators; void upgrades; void skills; void perks; void achievements; void repEarned; void eqEarned; void buffs;
  return totalCps(useGameStore.getState());
}

function useStoreClick(): number {
  const upgrades = useGameStore((s) => s.upgrades);
  const skills = useGameStore((s) => s.skills);
  const perks = useGameStore((s) => s.perks);
  const buffs = useGameStore((s) => s.activeBuffs);
  const repEarned = useGameStore((s) => s.reputationEarned);
  const eqEarned = useGameStore((s) => s.equityEarned);
  const achievements = useGameStore((s) => s.achievements);
  void upgrades; void skills; void perks; void buffs; void repEarned; void eqEarned; void achievements;
  return clickPower(useGameStore.getState());
}
