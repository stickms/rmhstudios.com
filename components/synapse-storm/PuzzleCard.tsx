'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ActivePuzzle,
    MathPuzzleData,
    PatternPuzzleData,
    LanguagePuzzleData,
    SpatialPuzzleData,
    MemoryPuzzleData,
    ReactionPuzzleData,
    MinigamePuzzleData,
    PowerUpPuzzleData,
    MetaPuzzleData,
    EmojiPuzzleData,
    TriviaPuzzleData,
    RomanPuzzleData,
    GameState,
    CATEGORY_COLORS,
    CATEGORY_ICONS,
    ShapeInfo,
} from '../../lib/synapse-storm/types';
import { soundManager } from '../../lib/synapse-storm/sounds';

interface PuzzleCardProps {
    puzzle: ActivePuzzle;
    gameState?: GameState;
    onSolve: (id: string, correct: boolean) => void;
    onSkipPhase?: (id: string) => void;
}

// ---- Shape SVG renderer ----
function ShapeSVG({ shape, color, size, rotation = 0 }: ShapeInfo) {
    const s = size;
    const half = s / 2;
    const rot = `rotate(${rotation} ${half} ${half})`;
    let path: React.ReactNode = null;

    switch (shape) {
        case 'circle':
            path = <circle cx={half} cy={half} r={half * 0.85} fill={color} />;
            break;
        case 'square':
            path = <rect x={s * 0.08} y={s * 0.08} width={s * 0.84} height={s * 0.84} rx={s * 0.12} fill={color} transform={rot} />;
            break;
        case 'triangle': {
            const points = `${half},${s * 0.1} ${s * 0.92},${s * 0.9} ${s * 0.08},${s * 0.9}`;
            path = <polygon points={points} fill={color} transform={rot} />;
            break;
        }
        case 'diamond': {
            const points = `${half},${s * 0.06} ${s * 0.94},${half} ${half},${s * 0.94} ${s * 0.06},${half}`;
            path = <polygon points={points} fill={color} transform={rot} />;
            break;
        }
        case 'hexagon': {
            const r = half * 0.88;
            const pts = Array.from({ length: 6 }, (_, i) => {
                const angle = (Math.PI / 180) * (60 * i - 30);
                return `${half + r * Math.cos(angle)},${half + r * Math.sin(angle)}`;
            }).join(' ');
            path = <polygon points={pts} fill={color} transform={rot} />;
            break;
        }
    }

    return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shape-svg">
            <defs>
                <filter id={`glow-${color.replace('#', '')}-${s}`}>
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <g style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}>
                {path}
            </g>
        </svg>
    );
}

// ---- Compute meta answer from game state ----
function computeMetaAnswer(variant: MetaPuzzleData['variant'], state: GameState): { answer: number; options: number[] } {
    const shuffleArr = <T,>(arr: T[]): T[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    const uniq = (raw: number[], ans: number, minCount: number, genExtra: () => number): number[] => {
        const seen = new Set<number>([ans]);
        const result = [ans];
        for (const o of raw) { if (!seen.has(o)) { seen.add(o); result.push(o); } }
        for (let attempts = 0; result.length < minCount && attempts < 20; attempts++) {
            const e = genExtra();
            if (!seen.has(e)) { seen.add(e); result.push(e); }
        }
        return shuffleArr(result);
    };

    let answer = 0;
    let options: number[] = [];
    switch (variant) {
        case 'gameTime':
            answer = Math.floor((Date.now() - state.startTime) / 1000);
            options = uniq([answer + 10, Math.max(0, answer - 10), answer + 25], answer, 4, () => Math.max(0, answer + Math.floor(Math.random() * 40 - 20)));
            break;
        case 'lives':
            answer = Math.max(0, state.missThreshold - state.puzzlesMissed);
            options = uniq([answer + 1, Math.max(0, answer - 1), answer + 2, answer + 3], answer, 4, () => Math.max(0, answer + Math.floor(Math.random() * 5)));
            break;
        case 'intensity':
            answer = Math.round(state.difficulty);
            options = uniq([Math.min(10, answer + 1), Math.max(1, answer - 1), Math.min(10, answer + 2)], answer, 4, () => Math.min(10, Math.max(1, answer + Math.floor(Math.random() * 6 - 3))));
            break;
        case 'combo':
            answer = state.combo;
            options = uniq([answer + 1, Math.max(0, answer - 1), answer + 3], answer, 4, () => Math.max(0, answer + Math.floor(Math.random() * 10)));
            break;
        case 'maxCombo':
            answer = state.maxCombo;
            options = uniq([answer + 1, Math.max(0, answer - 1), answer + 3], answer, 4, () => Math.max(0, answer + Math.floor(Math.random() * 10)));
            break;
        case 'score': {
            answer = state.score;
            const delta = Math.max(100, Math.floor(state.score * 0.1));
            options = uniq([answer + delta, Math.max(0, answer - delta), answer + delta * 2], answer, 4, () => Math.max(0, answer + delta * Math.floor(Math.random() * 6 - 2)));
            break;
        }
        case 'activeCount':
            answer = state.activePuzzles.filter(p => !p.solved && !p.expired).length;
            options = uniq([answer + 1, Math.max(0, answer - 1), answer + 2], answer, 4, () => Math.max(0, answer + Math.floor(Math.random() * 4)));
            break;
        case 'realTimeHour': {
            const h = (new Date().getHours() % 12) || 12;
            answer = h;
            const cands = [1,2,3,4,5,6,7,8,9,10,11,12].filter(x => x !== h);
            options = uniq(cands.slice(0, 3), h, 4, () => cands[Math.floor(Math.random() * cands.length)] ?? 1);
            break;
        }
    }
    return { answer, options };
}

// ============================================================
// RENDER: Math
// ============================================================
function MathContent({ data, onSolve, catColor }: { data: MathPuzzleData; onSolve: (v: string) => void; catColor: string }) {
    const [input, setInput] = useState('');

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (input.trim()) onSolve(input.trim().toLowerCase());
    };

    const needsInput = (data.variant === 'typing' as any) || (data.options === undefined);
    const showInput = needsInput || (['algebra', 'arithmetic'].includes(data.variant) && !data.options);

    if (data.options) {
        return (
            <>
                <div className="math-expression">{data.expression}</div>
                <div className="card-options" style={{ marginTop: 6 }}>
                    {data.options.map((opt, i) => (
                        <button key={i} className="opt-btn" onClick={() => onSolve(String(opt))}
                            style={{ '--cat-color': catColor } as React.CSSProperties}>
                            {opt}
                        </button>
                    ))}
                </div>
            </>
        );
    }

    return (
        <>
            <div className="math-expression">{data.expression}</div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 5 }}>
                <input
                    className="card-text-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    autoFocus
                    placeholder="Answer…"
                    style={{ '--cat-color': catColor, '--cat-rgb': '0,229,255' } as React.CSSProperties}
                />
                <button type="submit" className="opt-btn"
                    style={{ '--cat-color': catColor, minWidth: 36, flex: 'none' } as React.CSSProperties}>
                    ✓
                </button>
            </form>
        </>
    );
}

// ============================================================
// RENDER: Emoji
// ============================================================
function EmojiContent({ data, onSolve, catColor }: { data: EmojiPuzzleData; onSolve: (v: string) => void; catColor: string }) {
    return (
        <>
            <div className="emoji-prompt" style={{ fontSize: data.variant === 'count' || data.variant === 'odd_one_out' || data.variant === 'sequence' ? 22 : 40, textAlign: 'center', lineHeight: 1.4, margin: '4px 0', letterSpacing: '0.05em' }}>
                {data.prompt}
            </div>
            <div className="card-options" style={{ marginTop: 4 }}>
                {data.options.map((opt, i) => (
                    <button key={i} className="opt-btn" onClick={() => onSolve(opt)}
                        style={{ '--cat-color': catColor } as React.CSSProperties}>
                        {opt}
                    </button>
                ))}
            </div>
        </>
    );
}

// ============================================================
// RENDER: Trivia
// ============================================================
function TriviaContent({ data, onSolve, catColor }: { data: TriviaPuzzleData; onSolve: (v: string) => void; catColor: string }) {
    return (
        <div className="card-options" style={{ marginTop: 4 }}>
            {data.options.map((opt, i) => (
                <button key={i} className="opt-btn" onClick={() => onSolve(opt)}
                    style={{ '--cat-color': catColor } as React.CSSProperties}>
                    {opt}
                </button>
            ))}
        </div>
    );
}

// ============================================================
// RENDER: Roman
// ============================================================
function RomanContent({ data, onSolve, catColor }: { data: RomanPuzzleData; onSolve: (v: string) => void; catColor: string }) {
    if (data.variant === 'to_decimal') {
        return (
            <>
                <div className="roman-display">{data.roman}</div>
                <div className="card-options" style={{ marginTop: 4 }}>
                    {data.options.map((opt, i) => (
                        <button key={i} className="opt-btn" onClick={() => onSolve(opt)}
                            style={{ '--cat-color': catColor } as React.CSSProperties}>
                            {opt}
                        </button>
                    ))}
                </div>
            </>
        );
    }

    return (
        <>
            <div className="roman-decimal">{data.decimal}</div>
            <div className="card-options" style={{ marginTop: 4 }}>
                {data.options.map((opt, i) => (
                    <button key={i} className="opt-btn" onClick={() => onSolve(opt)}
                        style={{ '--cat-color': catColor, fontFamily: 'var(--mono)', letterSpacing: '0.08em' } as React.CSSProperties}>
                        {opt}
                    </button>
                ))}
            </div>
        </>
    );
}

// ============================================================
// RENDER: Pattern
// ============================================================
function PatternContent({ data, onSolve, catColor }: { data: PatternPuzzleData; onSolve: (v: string) => void; catColor: string }) {
    const encodeShape = (s: ShapeInfo) => `${s.shape}:${s.color}:${s.size}:${s.rotation ?? 0}`;

    return (
        <>
            <div className="pattern-sequence">
                {data.sequence.map((item, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <span className="pattern-sep">·</span>}
                        <div className="pattern-shape-wrap">
                            {i === data.missingIndex ? (
                                <div className="pattern-gap">?</div>
                            ) : (
                                <ShapeSVG {...item} size={Math.min(item.size, 32)} />
                            )}
                        </div>
                    </React.Fragment>
                ))}
            </div>
            <div className="pattern-options">
                {data.options.map((opt, i) => (
                    <button key={i} className="pattern-opt-btn" onClick={() => onSolve(encodeShape(opt))}>
                        <ShapeSVG {...opt} size={28} />
                    </button>
                ))}
            </div>
        </>
    );
}

// ============================================================
// RENDER: Spatial
// ============================================================
function SpatialContent({ data, onSolve, catColor }: { data: SpatialPuzzleData; onSolve: (v: string) => void; catColor: string }) {
    const [selected, setSelected] = useState<number | null>(null);

    if (data.variant === 'count') {
        return (
            <>
                <div className="spatial-grid">
                    {data.shapes.map((s, i) => (
                        <div key={i} className="spatial-item" style={{ cursor: 'default' }}>
                            <ShapeSVG {...s} size={s.size ?? 28} />
                        </div>
                    ))}
                </div>
                <div className="card-options" style={{ marginTop: 4 }}>
                    {(data.options ?? []).map((opt, i) => (
                        <button key={i} className="opt-btn" onClick={() => onSolve(String(opt))}
                            style={{ '--cat-color': catColor } as React.CSSProperties}>
                            {opt}
                        </button>
                    ))}
                </div>
            </>
        );
    }

    if (data.variant === 'pair') {
        const handleClick = (idx: number) => {
            const correct = (data.answerIndices ?? []).includes(idx);
            onSolve(correct ? 'correct' : 'wrong');
        };
        return (
            <div className="spatial-grid">
                {data.shapes.map((s, i) => (
                    <div key={i} className="spatial-item" onClick={() => handleClick(i)}>
                        <ShapeSVG {...s} size={28} />
                    </div>
                ))}
            </div>
        );
    }

    const handleClick = (idx: number) => {
        const correct = idx === data.answer;
        setSelected(idx);
        setTimeout(() => onSolve(correct ? 'correct' : 'wrong'), 80);
    };

    return (
        <div className="spatial-grid">
            {data.shapes.map((s, i) => (
                <div key={i}
                    className={`spatial-item ${selected === i ? 'selected' : ''}`}
                    onClick={() => handleClick(i)}>
                    <ShapeSVG {...s} size={Math.min(s.size ?? 28, 32)} />
                </div>
            ))}
        </div>
    );
}

// ============================================================
// RENDER: Language
// ============================================================
function LanguageContent({ data, onSolve, catColor }: { data: LanguagePuzzleData; onSolve: (v: string) => void; catColor: string }) {
    const [input, setInput] = useState('');
    const needsInput = ['typing', 'anagram', 'reverse'].includes(data.variant);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (input.trim()) onSolve(input.trim().toLowerCase());
    };

    if (data.variant === 'category' && !data.prompt && data.options) {
        return (
            <div className="card-options cols-2">
                {data.options.map((opt, i) => (
                    <button key={i} className="opt-btn" onClick={() => onSolve(opt)}
                        style={{ '--cat-color': catColor } as React.CSSProperties}>
                        {opt}
                    </button>
                ))}
            </div>
        );
    }

    if (data.options) {
        return (
            <>
                {data.prompt && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, textAlign: 'center', padding: '6px 0 4px', color: 'var(--text)', letterSpacing: '0.06em' }}>
                        {data.prompt}
                    </div>
                )}
                <div className="card-options" style={{ marginTop: 4 }}>
                    {data.options.map((opt, i) => (
                        <button key={i} className="opt-btn" onClick={() => onSolve(opt)}
                            style={{ '--cat-color': catColor } as React.CSSProperties}>
                            {opt}
                        </button>
                    ))}
                </div>
            </>
        );
    }

    return (
        <>
            {data.prompt && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: data.prompt.length > 8 ? 14 : 20, fontWeight: 800, textAlign: 'center', padding: '4px 0', color: 'var(--text)', letterSpacing: '0.06em' }}>
                    {data.prompt}
                </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 5 }}>
                <input
                    className="card-text-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    autoFocus
                    placeholder="Type answer…"
                    style={{ '--cat-color': catColor, '--cat-rgb': '118,255,3' } as React.CSSProperties}
                />
                <button type="submit" className="opt-btn"
                    style={{ '--cat-color': catColor, minWidth: 36, flex: 'none' } as React.CSSProperties}>
                    ✓
                </button>
            </form>
        </>
    );
}

// ============================================================
// RENDER: Memory
// ============================================================
function MemoryContent({ puzzle, onSolve, onSkipPhase }: { puzzle: ActivePuzzle; onSolve: (v: string) => void; onSkipPhase?: (id: string) => void }) {
    const data = puzzle.data as MemoryPuzzleData;
    const [input, setInput] = useState<string[]>([]);

    const isShow = puzzle.memoryPhase === 'show';

    const handleColorClick = (color: string) => {
        if (!isShow) {
            const newInput = [...input, color];
            setInput(newInput);
            if (newInput.length === data.sequence.length) {
                const correct = newInput.every((v, i) => v === data.sequence[i]);
                onSolve(correct ? 'correct' : 'wrong');
            }
        }
    };

    const handleNumberClick = (num: string) => {
        if (!isShow) {
            const newInput = [...input, num];
            setInput(newInput);
            if (newInput.length === data.sequence.length) {
                const correct = newInput.every((v, i) => String(v) === String(data.sequence[i]));
                onSolve(correct ? 'correct' : 'wrong');
            }
        }
    };

    if (isShow) {
        return (
            <div className="memory-show-phase">
                <div className="memory-phase-label">Memorize!</div>
                <div className="memory-sequence-display">
                    {data.sequence.map((item, i) => {
                        if (data.variant === 'colors') {
                            return <div key={i} className="memory-color-swatch" style={{ background: item as string }} />;
                        }
                        if (data.variant === 'shapes') {
                            return (
                                <div key={i} className="memory-seq-item memory-shape-item">
                                    <ShapeSVG shape={item as ShapeInfo['shape']} color="#b388ff" size={24} />
                                </div>
                            );
                        }
                        return <div key={i} className="memory-seq-item memory-number">{item}</div>;
                    })}
                </div>
                {onSkipPhase && (
                    <button className="opt-btn" onClick={() => onSkipPhase(puzzle.id)}
                        style={{ fontSize: 10, padding: '4px 10px', marginTop: 6, '--cat-color': 'var(--purple)' } as React.CSSProperties}>
                        Ready →
                    </button>
                )}
            </div>
        );
    }

    // Input phase
    if (data.variant === 'numbers') {
        const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        return (
            <>
                <div className="memory-phase-label">Recall sequence!</div>
                <div className="memory-input-row">
                    {Array.from({ length: data.sequence.length }, (_, i) => (
                        <div key={i} className={`memory-input-slot ${i < input.length ? 'filled' : 'unfilled'}`}>
                            {i < input.length ? input[i] : '?'}
                        </div>
                    ))}
                </div>
                <div className="card-options" style={{ marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {digits.map(d => (
                        <button key={d} className="opt-btn" onClick={() => handleNumberClick(String(d))}
                            style={{ '--cat-color': 'var(--purple)', minWidth: 32, padding: '5px' } as React.CSSProperties}>
                            {d}
                        </button>
                    ))}
                </div>
            </>
        );
    }

    if (data.variant === 'colors') {
        const colors = ['#ff5252', '#00e5ff', '#76ff03', '#ffab00', '#b388ff', '#ff6ec7'];
        return (
            <>
                <div className="memory-phase-label">Tap in order!</div>
                <div className="memory-input-row">
                    {Array.from({ length: data.sequence.length }, (_, i) => (
                        <div key={i} className={`memory-input-slot ${i < input.length ? 'filled' : 'unfilled'}`}
                            style={i < input.length ? { background: input[i] as string, opacity: 0.8 } : {}}>
                            {i < input.length ? '' : '?'}
                        </div>
                    ))}
                </div>
                <div className="card-options" style={{ marginTop: 4, flexWrap: 'wrap', justifyContent: 'center', gap: 5 }}>
                    {colors.map(c => (
                        <div key={c} onClick={() => handleColorClick(c)}
                            className="memory-color-swatch"
                            style={{ background: c, cursor: 'pointer', border: '2px solid rgba(255,255,255,0.15)', transition: 'transform 0.1s', width: 26, height: 26 }}
                        />
                    ))}
                </div>
            </>
        );
    }

    // shapes
    const shapeNames = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
    return (
        <>
            <div className="memory-phase-label">Recall shapes!</div>
            <div className="memory-input-row">
                {Array.from({ length: data.sequence.length }, (_, i) => (
                    <div key={i} className={`memory-input-slot ${i < input.length ? 'filled' : 'unfilled'}`}>
                        {i < input.length ? <ShapeSVG shape={input[i] as ShapeInfo['shape']} color="#b388ff" size={20} /> : '?'}
                    </div>
                ))}
            </div>
            <div className="card-options" style={{ marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {shapeNames.map(s => (
                    <button key={s} className="opt-btn" onClick={() => handleNumberClick(s)}
                        style={{ '--cat-color': 'var(--purple)', padding: '4px 6px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties}>
                        <ShapeSVG shape={s as ShapeInfo['shape']} color="#b388ff" size={22} />
                    </button>
                ))}
            </div>
        </>
    );
}

// ============================================================
// RENDER: Reaction
// ============================================================
function ReactionContent({ puzzle, onSolve, catColor }: { puzzle: ActivePuzzle; onSolve: (v: string) => void; catColor: string }) {
    const data = puzzle.data as ReactionPuzzleData;
    const [clicked, setClicked] = useState<Set<number>>(new Set());
    const [positions, setPositions] = useState<{ x: number; y: number }[]>(() =>
        Array.from({ length: data.targetCount + (data.decoys ?? 0) }, () => ({
            x: 8 + Math.random() * 84,
            y: 8 + Math.random() * 84,
        }))
    );

    // Moving variant: reposition unclicked targets periodically
    useEffect(() => {
        if (data.variant !== 'moving') return;
        const interval = setInterval(() => {
            setPositions(prev => prev.map(() => ({
                x: 8 + Math.random() * 84,
                y: 8 + Math.random() * 84,
            })));
        }, 1000);
        return () => clearInterval(interval);
    }, [data.variant]);

    const handleClick = (idx: number, isDecoy: boolean) => {
        if (clicked.has(idx)) return;

        if (data.variant === 'decoy') {
            if (isDecoy) {
                onSolve('wrong');
                return;
            }
            const newClicked = new Set(clicked).add(idx);
            setClicked(newClicked);
            if (newClicked.size >= data.targetCount) onSolve('correct');
            return;
        }

        if (data.variant === 'sequence') {
            const expectedNext = clicked.size;
            if (idx === expectedNext) {
                const newClicked = new Set(clicked).add(idx);
                setClicked(newClicked);
                if (newClicked.size >= data.targetCount) onSolve('correct');
            } else {
                onSolve('wrong');
            }
            return;
        }

        const newClicked = new Set(clicked).add(idx);
        setClicked(newClicked);
        if (newClicked.size >= data.targetCount) onSolve('correct');
    };

    const handleDouble = (idx: number) => {
        if (data.variant === 'double') {
            const newClicked = new Set(clicked).add(idx);
            setClicked(newClicked);
            if (newClicked.size >= data.targetCount) onSolve('correct');
        }
    };

    const variantClass = (isDecoy: boolean) => {
        if (isDecoy) return 'decoy-target';
        if (data.variant === 'sequence') return 'sequence-target';
        if (data.variant === 'decoy') return 'green-target';
        if (data.variant === 'jitter') return 'jitter-target';
        if (data.variant === 'moving') return 'moving-target';
        if (data.variant === 'burst') return 'burst-target';
        return '';
    };

    const targetBg = (isDecoy: boolean) => {
        if (isDecoy) return '#c62828';
        if (data.variant === 'sequence') return 'var(--cyan)';
        if (data.variant === 'decoy') return '#69f0ae';
        return 'var(--red)';
    };

    return (
        <div className="reaction-area" style={{ height: 90, position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)', margin: '4px 0' }}>
            {positions.map((pos, i) => {
                const isDecoy = i >= data.targetCount;
                const isDone = clicked.has(i);
                if (isDone) return null;
                const isSeq = data.variant === 'sequence';
                const seqLabel = isSeq ? (i < data.targetCount ? i + 1 : '') : '';
                return (
                    <div key={i}
                        className={`reaction-target ${variantClass(isDecoy)}`}
                        style={{
                            left: `${pos.x}%`, top: `${pos.y}%`,
                            transform: 'translate(-50%, -50%)',
                            background: targetBg(isDecoy),
                        }}
                        onClick={() => data.variant !== 'double' ? handleClick(i, isDecoy) : undefined}
                        onDoubleClick={() => handleDouble(i)}
                    >
                        {seqLabel}
                    </div>
                );
            })}
        </div>
    );
}

// ============================================================
// RENDER: Minigame
// ============================================================
function MinigameContent({ puzzle, onSolve, catColor }: { puzzle: ActivePuzzle; onSolve: (v: string) => void; catColor: string }) {
    const data = puzzle.data as MinigamePuzzleData;
    const [goVisible, setGoVisible] = useState(false);
    const [clicked, setClicked] = useState(false);
    const [tapCount, setTapCount] = useState(0);
    const [countdown, setCountdown] = useState(3);
    const [countdownDone, setCountdownDone] = useState(false);
    const [waitTapped, setWaitTapped] = useState(false);

    useEffect(() => {
        if (data.variant === 'click_when_go') {
            const delay = 1000 + Math.random() * 2000;
            const t = setTimeout(() => setGoVisible(true), delay);
            return () => clearTimeout(t);
        }
        if (data.variant === 'countdown') {
            const interval = setInterval(() => {
                setCountdown(c => {
                    if (c <= 1) { clearInterval(interval); setCountdownDone(true); return 0; }
                    return c - 1;
                });
            }, 700);
            return () => clearInterval(interval);
        }
    }, [data.variant]);

    if (data.variant === 'click_when_go') {
        const handleClick = () => {
            if (!goVisible) {
                onSolve('wrong');
                return;
            }
            if (!clicked) {
                setClicked(true);
                onSolve('correct');
            }
        };
        return (
            <div className="mini-go-display" onClick={handleClick} style={{ cursor: 'pointer', userSelect: 'none', padding: '14px 0' }}>
                <div className={`mini-go-word ${goVisible ? 'go' : 'wait'}`}>
                    {goVisible ? 'GO!' : 'WAIT...'}
                </div>
                {!goVisible && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Don't tap yet!</div>}
            </div>
        );
    }

    if (data.variant === 'dont_click') {
        useEffect(() => {
            const t = setTimeout(() => { onSolve('correct'); }, Math.max(1500, puzzle.timeLimit * 700));
            return () => clearTimeout(t);
        }, []);
        return (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--red)', fontFamily: 'var(--mono)' }}>DON'T!</div>
                <button className="opt-btn" style={{ marginTop: 8, '--cat-color': 'var(--red)', background: 'rgba(255,82,82,0.1)', borderColor: 'rgba(255,82,82,0.3)', color: 'var(--red)' } as React.CSSProperties}
                    onClick={() => onSolve('wrong')}>
                    CLICK
                </button>
            </div>
        );
    }

    if (data.variant === 'whack') {
        const [pos, setPos] = useState(() => ({ x: 15 + Math.random() * 70, y: 15 + Math.random() * 70 }));
        const [whacks, setWhacks] = useState(0);
        const needed = 3;

        useEffect(() => {
            const interval = setInterval(() => {
                setPos({ x: 10 + Math.random() * 80, y: 10 + Math.random() * 80 });
            }, 900);
            return () => clearInterval(interval);
        }, []);

        const handleWhack = () => {
            const next = whacks + 1;
            setWhacks(next);
            if (next >= needed) {
                onSolve('correct');
            } else {
                setPos({ x: 10 + Math.random() * 80, y: 10 + Math.random() * 80 });
            }
        };

        return (
            <div className="mini-whack-area">
                <div className="mini-whack-target"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onClick={handleWhack}>
                    🐹
                </div>
                <div style={{ position: 'absolute', bottom: 3, right: 6, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                    {whacks}/{needed}
                </div>
            </div>
        );
    }

    if (data.variant === 'countdown') {
        const handleTap = () => {
            if (countdownDone) {
                onSolve('correct');
            } else {
                onSolve('wrong');
            }
        };
        return (
            <div className="mini-tap-counter" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={handleTap}>
                {countdown}
                {countdownDone && <div style={{ fontSize: 16, color: 'var(--green)' }}>TAP NOW!</div>}
            </div>
        );
    }

    if (data.variant === 'double_tap') {
        const [tapStage, setTapStage] = useState(0);
        const handleTap = () => {
            if (tapStage === 0) {
                setTapStage(1);
                setTimeout(() => setTapStage(0), 500);
            } else {
                onSolve('correct');
            }
        };
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 70 }}>
                <div
                    style={{
                        width: 60, height: 60, borderRadius: '50%', cursor: 'pointer',
                        background: tapStage === 1 ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.1)',
                        border: `2px solid rgba(0,229,255,${tapStage === 1 ? 0.8 : 0.3})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, transition: 'all 0.1s',
                    }}
                    onClick={handleTap}
                >
                    👆
                </div>
            </div>
        );
    }

    if (data.variant === 'tap_fast') {
        const handleTap = () => {
            const newCount = tapCount + 1;
            setTapCount(newCount);
            if (newCount >= 5) onSolve('correct');
        };
        return (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 900, color: 'var(--cyan)', marginBottom: 6 }}>
                    {tapCount}/5
                </div>
                <button className="opt-btn" onClick={handleTap}
                    style={{ '--cat-color': catColor, padding: '10px 20px', fontSize: 14 } as React.CSSProperties}>
                    TAP!
                </button>
            </div>
        );
    }

    if ((data.variant === 'pick_biggest' || data.variant === 'pick_odd') && data.shapes) {
        return (
            <div className="mini-shapes-row">
                {data.shapes.map((s, i) => (
                    <div key={i} className="mini-shape-btn"
                        onClick={() => onSolve(i === data.answerIndex ? 'correct' : 'wrong')}>
                        <ShapeSVG {...s} size={s.size ?? 28} />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-2)' }}>
            <button className="opt-btn" onClick={() => onSolve('correct')}
                style={{ '--cat-color': catColor } as React.CSSProperties}>
                OK
            </button>
        </div>
    );
}

// ============================================================
// RENDER: Fling
// ============================================================
function FlingContent({ puzzle, onSolve }: { puzzle: ActivePuzzle; onSolve: (v: string) => void }) {
    const data = puzzle.data as MinigamePuzzleData;
    const target = data.targetDirection;
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
    const [solved, setSolved] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const arrowMap: Record<string, string> = {
        left: '←', right: '→', top: '↑', bottom: '↓',
        'top-left': '↖', 'top-right': '↗', 'bottom-left': '↙', 'bottom-right': '↘',
    };

    const handleStart = (clientX: number, clientY: number) => {
        if (solved) return;
        startRef.current = { x: clientX, y: clientY };
    };

    const handleMove = (clientX: number, clientY: number) => {
        if (!startRef.current || solved) return;
        setDragDelta({
            x: clientX - startRef.current.x,
            y: clientY - startRef.current.y,
        });
    };

    const resolveDirection = (dx: number, dy: number): string => {
        const isH = Math.abs(dx) > Math.abs(dy);
        if (isH) return dx > 0 ? 'right' : 'left';
        if (Math.abs(dx) > 0.6 * Math.abs(dy)) {
            return dy > 0
                ? (dx > 0 ? 'bottom-right' : 'bottom-left')
                : (dx > 0 ? 'top-right' : 'top-left');
        }
        return dy > 0 ? 'bottom' : 'top';
    };

    const handleEnd = (clientX: number, clientY: number) => {
        if (!startRef.current || solved) return;
        const dx = clientX - startRef.current.x;
        const dy = clientY - startRef.current.y;
        const minDist = 20;
        if (Math.abs(dx) < minDist && Math.abs(dy) < minDist) {
            setDragDelta({ x: 0, y: 0 });
            startRef.current = null;
            return;
        }

        const dir = resolveDirection(dx, dy);
        const correct = dir === target;
        setSolved(true);
        // Fly off in drag direction
        setDragDelta({ x: dx * 4, y: dy * 4 });
        setTimeout(() => onSolve(correct ? 'correct' : 'wrong'), 220);
        startRef.current = null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        handleStart(e.clientX, e.clientY);
        const onMove = (ev: MouseEvent) => handleMove(ev.clientX, ev.clientY);
        const onUp = (ev: MouseEvent) => {
            handleEnd(ev.clientX, ev.clientY);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        e.preventDefault();
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        e.preventDefault();
        handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    };

    const rotation = Math.max(-25, Math.min(25, dragDelta.x * 0.4));
    const dist = Math.sqrt(dragDelta.x ** 2 + dragDelta.y ** 2);
    const glowOpacity = Math.min(0.3, dist / 200);

    return (
        <div ref={containerRef}
            className={`fling-card ${solved ? 'fling-solved' : ''}`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ position: 'relative' }}>
            <div className="fling-trail" style={{
                background: `radial-gradient(circle at ${50 - dragDelta.x * 0.3}% ${50 - dragDelta.y * 0.3}%, rgba(255,110,199,${glowOpacity}), transparent 70%)`,
                opacity: dist > 5 ? 1 : 0,
            }} />
            <div className="fling-card-inner" style={{
                transform: `translate(${dragDelta.x}px, ${dragDelta.y}px) rotate(${rotation}deg)`,
                transition: solved ? 'transform 0.25s ease-out, opacity 0.25s ease-out' : dragDelta.x === 0 && dragDelta.y === 0 ? 'transform 0.15s ease-out' : 'none',
                opacity: solved ? 0 : 1,
                pointerEvents: 'none',
            }}>
                <div className="fling-arrow" style={{
                    color: 'var(--pink)',
                    textShadow: `0 0 ${16 + dist * 0.2}px rgba(255,110,199,${0.6 + glowOpacity})`,
                }}>
                    {arrowMap[target ?? 'right'] ?? '?'}
                </div>
                <div className="fling-hint">Swipe {target?.replace(/-/g, ' ') ?? ''}</div>
            </div>
        </div>
    );
}

// ============================================================
// RENDER: Powerup
// ============================================================
function PowerupContent({ puzzle, onSolve, catColor }: { puzzle: ActivePuzzle; onSolve: (v: string) => void; catColor: string }) {
    const data = puzzle.data as PowerUpPuzzleData;
    const [sliderVal, setSliderVal] = useState(0);
    const [spamCount, setSpamCount] = useState(0);
    const [holdProgress, setHoldProgress] = useState(0);
    const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleSlider = (val: number) => {
        setSliderVal(val);
        if (val >= 98) onSolve('correct');
    };

    const handleSpam = () => {
        const newCount = spamCount + 1;
        setSpamCount(newCount);
        if (newCount >= data.targetValue) onSolve('correct');
    };

    const startHold = () => {
        holdIntervalRef.current = setInterval(() => {
            setHoldProgress(p => {
                const next = p + 4;
                if (next >= 100) {
                    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
                    setTimeout(() => onSolve('correct'), 50);
                    return 100;
                }
                return next;
            });
        }, 60);
    };

    const stopHold = () => {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
        setHoldProgress(0);
    };

    return (
        <div className="powerup-card">
            <div className="powerup-effect">{data.effectDescription}</div>
            {data.actionType === 'slider' && (
                <div className="powerup-slider-wrap">
                    <input type="range" min={0} max={100} value={sliderVal}
                        className="powerup-slider"
                        onChange={e => handleSlider(Number(e.target.value))} />
                    <div className="powerup-progress">
                        <div className="powerup-progress-fill" style={{ width: `${sliderVal}%` }} />
                    </div>
                </div>
            )}
            {data.actionType === 'spam' && (
                <>
                    <button className="powerup-spam-btn" onClick={handleSpam}>
                        CLICK! ({spamCount}/{data.targetValue})
                    </button>
                    <div className="powerup-progress" style={{ marginTop: 4 }}>
                        <div className="powerup-progress-fill" style={{ width: `${(spamCount / data.targetValue) * 100}%` }} />
                    </div>
                </>
            )}
            {data.actionType === 'hold' && (
                <>
                    <button
                        className={`powerup-hold-btn ${holdProgress > 0 ? 'holding' : ''}`}
                        onMouseDown={startHold}
                        onMouseUp={stopHold}
                        onMouseLeave={stopHold}
                        onTouchStart={startHold}
                        onTouchEnd={stopHold}
                    >
                        HOLD ({Math.round(holdProgress)}%)
                    </button>
                    <div className="powerup-progress" style={{ marginTop: 4 }}>
                        <div className="powerup-progress-fill" style={{ width: `${holdProgress}%` }} />
                    </div>
                </>
            )}
        </div>
    );
}

// ============================================================
// RENDER: Meta
// ============================================================
function MetaContent({ puzzle, gameState, onSolve, catColor }: { puzzle: ActivePuzzle; gameState?: GameState; onSolve: (v: string) => void; catColor: string }) {
    const data = puzzle.data as MetaPuzzleData;
    const computed = useRef<{ answer: number; options: number[] } | null>(null);

    if (!computed.current) {
        if (gameState) {
            computed.current = computeMetaAnswer(data.variant, gameState);
        } else if (data.answer !== undefined && data.options) {
            computed.current = { answer: data.answer, options: data.options };
        }
    }

    const { answer, options } = computed.current ?? { answer: 0, options: [0, 1, 2, 3] };

    return (
        <>
            <div className="meta-instruction">{puzzle.instruction}</div>
            <div className="card-options" style={{ marginTop: 4 }}>
                {options.map((opt, i) => (
                    <button key={i} className="opt-btn"
                        onClick={() => onSolve(opt === answer ? 'correct' : 'wrong')}
                        style={{ '--cat-color': catColor } as React.CSSProperties}>
                        {opt}
                    </button>
                ))}
            </div>
        </>
    );
}

// ============================================================
// MAIN PuzzleCard component
// ============================================================
export const PuzzleCard: React.FC<PuzzleCardProps> = ({ puzzle, gameState, onSolve, onSkipPhase }) => {
    const [animClass, setAnimClass] = useState('');
    const solvedRef = useRef(false);

    // ── Drag-with-momentum state ──
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const dragRef = useRef<{
        active: boolean;
        startX: number; startY: number;
        startOx: number; startOy: number;
        velX: number; velY: number;
        lastX: number; lastY: number;
        lastT: number;
        didDrag: boolean;
    } | null>(null);
    const momentumRef = useRef<number | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    const startDrag = useCallback((clientX: number, clientY: number) => {
        if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null; }
        dragRef.current = {
            active: true, startX: clientX, startY: clientY,
            startOx: offset.x, startOy: offset.y,
            velX: 0, velY: 0, lastX: clientX, lastY: clientY,
            lastT: performance.now(), didDrag: false,
        };
    }, [offset]);

    const moveDrag = useCallback((clientX: number, clientY: number) => {
        const d = dragRef.current;
        if (!d?.active) return;
        const dx = clientX - d.startX;
        const dy = clientY - d.startY;
        if (!d.didDrag && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        d.didDrag = true;
        const now = performance.now();
        const dt = Math.max(1, now - d.lastT);
        d.velX = (clientX - d.lastX) / dt * 16;
        d.velY = (clientY - d.lastY) / dt * 16;
        d.lastX = clientX; d.lastY = clientY; d.lastT = now;
        setOffset({ x: d.startOx + dx, y: d.startOy + dy });
    }, []);

    const endDrag = useCallback(() => {
        const d = dragRef.current;
        if (!d?.active) return;
        d.active = false;
        if (!d.didDrag) { dragRef.current = null; return; }
        // Momentum coast
        let vx = d.velX, vy = d.velY;
        const friction = 0.92;
        const coast = () => {
            vx *= friction; vy *= friction;
            if (Math.abs(vx) < 0.3 && Math.abs(vy) < 0.3) { momentumRef.current = null; return; }
            setOffset(prev => ({ x: prev.x + vx, y: prev.y + vy }));
            momentumRef.current = requestAnimationFrame(coast);
        };
        momentumRef.current = requestAnimationFrame(coast);
        // Reset didDrag after a tick so click handlers can check it
        setTimeout(() => { if (dragRef.current) dragRef.current.didDrag = false; }, 0);
    }, []);

    // Global mouse/touch listeners for drag
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
        const onMouseUp = () => endDrag();
        const onTouchMove = (e: TouchEvent) => { if (dragRef.current?.active) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); } };
        const onTouchEnd = () => endDrag();
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
            if (momentumRef.current) cancelAnimationFrame(momentumRef.current);
        };
    }, [moveDrag, endDrag]);

    const catColor = CATEGORY_COLORS[puzzle.category];
    const catIcon = CATEGORY_ICONS[puzzle.category];
    const timerPct = Math.max(0, puzzle.timeRemaining / puzzle.timeLimit);
    const timeCritical = puzzle.timeRemaining < puzzle.timeLimit * 0.3 && puzzle.timeRemaining < 4;

    const handleSolve = useCallback((value: string) => {
        if (solvedRef.current || puzzle.solved || puzzle.expired) return;
        solvedRef.current = true;

        const correct = checkAnswer(puzzle, value);
        if (!correct) {
            setAnimClass('wrong-answer');
            setTimeout(() => setAnimClass(''), 500);
            solvedRef.current = false;
        }
        onSolve(puzzle.id, correct);
    }, [puzzle, onSolve]);

    const cardClasses = [
        'puzzle-card',
        puzzle.expired ? 'expired' : '',
        puzzle.isPriority ? 'is-priority' : '',
        timeCritical ? 'time-critical' : '',
        dragRef.current?.active ? 'dragging' : '',
        animClass,
    ].filter(Boolean).join(' ');

    const catColorKey = catColor.replace('#', '');

    const content = renderPuzzleContent(puzzle, gameState, handleSolve, onSkipPhase, catColor);

    const onCardPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // Don't start drag if user clicked a button, input, or interactive element
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).closest('button, input, .fling-card, .opt-btn, .powerup-slider')) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        startDrag(clientX, clientY);
    }, [startDrag]);

    return (
        <div
            ref={cardRef}
            className={cardClasses}
            onMouseDown={onCardPointerDown}
            onTouchStart={onCardPointerDown}
            style={{
                left: `${puzzle.position.x}%`,
                top: `${puzzle.position.y}%`,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                '--cat-color': catColor,
                cursor: 'grab',
                touchAction: 'none',
            } as React.CSSProperties}
        >
            {/* Timer bar */}
            <div className="card-timer-bar" style={{ width: `${timerPct * 100}%` }} />

            {/* Header */}
            <div className="card-header">
                <div className="card-category-badge">
                    <span className="card-category-icon">{catIcon}</span>
                    {puzzle.category}
                </div>
                <div className="card-points-hint">+{puzzle.basePoints}</div>
            </div>

            {/* Body */}
            <div className="card-body">
                {puzzle.category !== 'meta' && puzzle.category !== 'memory' && (
                    <div className="card-instruction">{puzzle.instruction}</div>
                )}
                {content}
            </div>
        </div>
    );
};

// ---- Answer checker ----
function checkAnswer(puzzle: ActivePuzzle, value: string): boolean {
    const v = value.trim().toLowerCase();
    const data = puzzle.data;

    if (v === 'correct') return true;
    if (v === 'wrong') return false;

    if (data.type === 'math') {
        return v === String(data.answer).toLowerCase();
    }
    if (data.type === 'pattern') {
        const encodeShape = (s: ShapeInfo) => `${s.shape}:${s.color}:${s.size}:${s.rotation ?? 0}`;
        return encodeShape(data.answer) === v;
    }
    if (data.type === 'language') {
        return v === data.answer.toLowerCase();
    }
    if (data.type === 'emoji') {
        return v === data.answer.toLowerCase();
    }
    if (data.type === 'trivia') {
        return v === data.answer.toLowerCase();
    }
    if (data.type === 'roman') {
        return v.toUpperCase() === data.answer.toUpperCase();
    }

    return false;
}

// ---- Route to correct renderer ----
function renderPuzzleContent(
    puzzle: ActivePuzzle,
    gameState: GameState | undefined,
    onSolve: (v: string) => void,
    onSkipPhase: ((id: string) => void) | undefined,
    catColor: string,
): React.ReactNode {
    const data = puzzle.data;

    switch (data.type) {
        case 'math':
            return <MathContent data={data} onSolve={onSolve} catColor={catColor} />;
        case 'emoji':
            return <EmojiContent data={data} onSolve={onSolve} catColor={catColor} />;
        case 'trivia':
            return <TriviaContent data={data} onSolve={onSolve} catColor={catColor} />;
        case 'roman':
            return <RomanContent data={data} onSolve={onSolve} catColor={catColor} />;
        case 'pattern':
            return <PatternContent data={data} onSolve={onSolve} catColor={catColor} />;
        case 'spatial':
            return <SpatialContent data={data} onSolve={onSolve} catColor={catColor} />;
        case 'language':
            return <LanguageContent data={data} onSolve={onSolve} catColor={catColor} />;
        case 'memory':
            return <MemoryContent puzzle={puzzle} onSolve={onSolve} onSkipPhase={onSkipPhase} />;
        case 'reaction':
            return <ReactionContent puzzle={puzzle} onSolve={onSolve} catColor={catColor} />;
        case 'minigame':
            if (data.variant === 'fling_direction') {
                return <FlingContent puzzle={puzzle} onSolve={onSolve} />;
            }
            return <MinigameContent puzzle={puzzle} onSolve={onSolve} catColor={catColor} />;
        case 'powerup':
            return <PowerupContent puzzle={puzzle} onSolve={onSolve} catColor={catColor} />;
        case 'meta':
            return <MetaContent puzzle={puzzle} gameState={gameState} onSolve={onSolve} catColor={catColor} />;
        default:
            return null;
    }
}
