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
    PowerUpPuzzleData,
    CATEGORY_COLORS,
    CATEGORY_LABELS,
    ShapeInfo,
} from '../../lib/synapse-storm/types';
import { soundManager } from '../../lib/synapse-storm/sounds';

interface PuzzleCardProps {
    puzzle: ActivePuzzle;
    onSolve: (id: string, correct: boolean) => void;
    onSkipPhase?: (id: string) => void;
}

// ---- MATH ----
const MathRenderer: React.FC<{ data: MathPuzzleData; onAnswer: (correct: boolean) => void }> = ({
    data,
    onAnswer,
}) => (
    <div className="puzzle-content">
        <div className="puzzle-expression">{data.expression} = ?</div>
        <div className="puzzle-options">
            {data.options?.map((opt, i) => (
                <button key={i} className="option-btn" onClick={() => onAnswer(opt === data.answer)}>
                    {opt}
                </button>
            ))}
        </div>
    </div>
);

// ---- SHARED SHAPES ----
const SVG_SHAPES: Record<string, (color: string, size: number, key: string) => React.ReactNode> = {
    circle: (color, size, key) => (
        <circle key={key} cx={size / 2} cy={size / 2} r={size / 2 - 2} fill={color} />
    ),
    square: (color, size, key) => (
        <rect key={key} x={2} y={2} width={size - 4} height={size - 4} fill={color} />
    ),
    triangle: (color, size, key) => (
        <polygon
            key={key}
            points={`${size / 2},2 ${size - 2},${size - 2} 2,${size - 2}`}
            fill={color}
        />
    ),
    diamond: (color, size, key) => (
        <polygon
            key={key}
            points={`${size / 2},2 ${size - 2},${size / 2} ${size / 2},${size - 2} 2,${size / 2}`}
            fill={color}
        />
    ),
    hexagon: (color, size, key) => {
        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 2;
        const pts = Array.from({ length: 6 }, (_, i) => {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
        }).join(' ');
        return <polygon key={key} points={pts} fill={color} />;
    },
};

const compareShapes = (s1: ShapeInfo, s2: ShapeInfo) => {
    return s1.shape === s2.shape &&
        s1.color === s2.color &&
        s1.size === s2.size &&
        (s1.rotation || 0) === (s2.rotation || 0);
};

// ---- PATTERN ----
const PatternRenderer: React.FC<{
    data: PatternPuzzleData;
    onAnswer: (correct: boolean) => void;
}> = ({ data, onAnswer }) => (
    <div className="puzzle-content">
        <div className="pattern-sequence" style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            {data.sequence.map((s, i) => (
                i === data.missingIndex ? (
                    <div key={i} className="seq-unknown" style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--text-muted)', borderRadius: '6px' }}>?</div>
                ) : (
                    <svg
                        key={i}
                        width={s.size}
                        height={s.size}
                        style={{ transform: s.rotation ? `rotate(${s.rotation}deg)` : 'none' }}
                    >
                        {SVG_SHAPES[s.shape]?.(s.color, s.size, `shape-${i}`)}
                    </svg>
                )
            ))}
        </div>
        <div className="puzzle-options shape-options" style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {data.options.map((opt, i) => (
                <button
                    key={i}
                    className="option-btn shape-option-btn"
                    onClick={() => onAnswer(compareShapes(opt, data.answer))}
                    style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <svg
                        width={opt.size}
                        height={opt.size}
                        style={{ transform: opt.rotation ? `rotate(${opt.rotation}deg)` : 'none' }}
                    >
                        {SVG_SHAPES[opt.shape]?.(opt.color, opt.size, `opt-${i}`)}
                    </svg>
                </button>
            ))}
        </div>
    </div>
);

// ---- LANGUAGE ----
const LanguageRenderer: React.FC<{
    data: LanguagePuzzleData;
    onAnswer: (correct: boolean) => void;
}> = ({ data, onAnswer }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAnswer(input.toLowerCase().trim() === data.answer.toLowerCase().trim());
        setInput('');
    };

    if (data.options) {
        return (
            <div className="puzzle-content">
                <div className="puzzle-prompt">{data.prompt}</div>
                <div className="puzzle-options">
                    {data.options.map((opt, i) => (
                        <button key={i} className="option-btn" onClick={() => onAnswer(opt === data.answer)}>
                            {opt}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="puzzle-content">
            <div className="puzzle-prompt">{data.prompt}</div>
            <form onSubmit={handleSubmit} className="puzzle-input-form">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={data.variant === 'spelling' ? 'Letter...' : 'Type here...'}
                    className="puzzle-text-input"
                    maxLength={data.variant === 'spelling' ? 1 : 20}
                />
                <button type="submit" className="submit-btn">
                    ✓
                </button>
            </form>
        </div>
    );
};

// ---- SPATIAL ----

const SpatialRenderer: React.FC<{
    data: SpatialPuzzleData;
    onAnswer: (correct: boolean) => void;
}> = ({ data, onAnswer }) => (
    <div className="puzzle-content">
        <div className="shape-grid">
            {data.shapes.map((s, i) => (
                <svg
                    key={i}
                    width={s.size}
                    height={s.size}
                    className={`shape-svg ${['odd', 'color', 'size', 'rotation', 'match'].includes(data.variant) ? 'clickable-shape' : ''}`}
                    onClick={() => ['odd', 'color', 'size', 'rotation', 'match'].includes(data.variant) && onAnswer(i === data.answer)}
                    style={{
                        cursor: ['odd', 'color', 'size', 'rotation', 'match'].includes(data.variant) ? 'pointer' : 'default',
                        transform: s.rotation ? `rotate(${s.rotation}deg)` : 'none'
                    }}
                >
                    {SVG_SHAPES[s.shape]?.(s.color, s.size, `shape-${i}`)}
                </svg>
            ))}
        </div>
        {data.variant === 'count' && data.options && (
            <div className="puzzle-options">
                {data.options.map((opt, i) => (
                    <button key={i} className="option-btn" onClick={() => onAnswer(opt === data.answer)}>
                        {opt}
                    </button>
                ))}
            </div>
        )}
    </div>
);

// ---- MEMORY ----
const MemoryRenderer: React.FC<{
    data: MemoryPuzzleData;
    puzzleId: string;
    phase?: 'show' | 'input';
    onAnswer: (correct: boolean) => void;
    onSkipPhase?: (id: string) => void;
}> = ({ data, puzzleId, phase = 'show', onAnswer, onSkipPhase }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedInput = input.trim();
        if (!trimmedInput) {
            onAnswer(false);
            return;
        }

        if (data.variant === 'numbers') {
            const entered = trimmedInput.split('').map(Number);
            const correct = entered.length === data.sequence.length && entered.every((n, i) => n === data.sequence[i]);
            onAnswer(correct);
        } else if (data.variant === 'colors') {
            const entered = trimmedInput.split(',').filter(Boolean);
            const correct = entered.length === data.sequence.length && entered.every((c, i) => c === data.sequence[i]);
            onAnswer(correct);
        }
    };

    if (phase === 'show') {
        return (
            <div className="puzzle-content">
                <div className="memory-sequence">
                    {data.sequence.map((n, i) => (
                        <span key={i} className="memory-digit" style={data.variant === 'colors' ? { backgroundColor: n as string, color: 'transparent', width: 28, height: 28, borderRadius: '6px', display: 'inline-block', boxShadow: '0 0 8px rgba(0,0,0,0.3)' } : {}}>
                            {data.variant === 'colors' ? '' : n}
                        </span>
                    ))}
                </div>
                <div className="memory-hint">Memorize!</div>
                <button
                    className="option-btn ready-btn"
                    onClick={() => onSkipPhase?.(puzzleId)}
                    style={{ marginTop: '12px', width: '100%', background: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}
                >
                    READY!
                </button>
            </div>
        );
    }

    return (
        <div className="puzzle-content">
            <form onSubmit={handleSubmit} className="puzzle-input-form" style={{ flexDirection: 'column' }}>
                {data.variant === 'numbers' ? (
                    <input
                        type="text"
                        autoFocus
                        value={input}
                        onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="e.g. 385"
                        className="puzzle-text-input"
                        maxLength={data.sequence.length + 2}
                        style={{ width: '100%', textAlign: 'center', fontSize: '1.2rem', marginBottom: '8px' }}
                    />
                ) : (
                    <div className="color-input-controls">
                        <div className="selected-colors">
                            {input.split(',').filter(Boolean).map((c, i) => (
                                <span key={i} className="color-dot" style={{ backgroundColor: c, width: 20, height: 20, borderRadius: '50%', display: 'inline-block' }} />
                            ))}
                            {input === '' && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap colors in order</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div className="color-buttons" style={{ flex: 1 }}>
                                {['#ff5252', '#00e5ff', '#76ff03', '#ffab00', '#b388ff', '#ff6ec7'].map(c => (
                                    <button
                                        type="button"
                                        key={c}
                                        style={{ backgroundColor: c }}
                                        className="color-pick-btn"
                                        onClick={() => {
                                            const parts = input.split(',').filter(Boolean);
                                            if (parts.length < data.sequence.length) {
                                                setInput(prev => prev ? `${prev},${c}` : c);
                                            }
                                        }}
                                    />
                                ))}
                            </div>
                            <button
                                type="submit"
                                className="submit-btn"
                                style={{
                                    flex: 1,
                                    height: 'auto',
                                    fontSize: '1.2rem',
                                    background: input.split(',').filter(Boolean).length === data.sequence.length ? 'rgba(118, 255, 3, 0.25)' : 'rgba(255,255,255,0.05)',
                                    color: input.split(',').filter(Boolean).length === data.sequence.length ? 'var(--accent-green)' : 'var(--text-muted)',
                                    borderColor: input.split(',').filter(Boolean).length === data.sequence.length ? 'var(--accent-green)' : 'transparent',
                                }}
                            >
                                SUBMIT
                            </button>
                        </div>
                        <button type="button" className="option-btn text-small" style={{ width: 'fit-content' }} onClick={() => setInput('')}>Clear</button>
                    </div>
                )}
                {data.variant === 'numbers' && (
                    <button type="submit" className="submit-btn" style={{ width: '100%' }}>✓ SUBMIT</button>
                )}
            </form>
        </div>
    );
};

// ---- REACTION ----
const ReactionRenderer: React.FC<{
    data: ReactionPuzzleData;
    onAnswer: (correct: boolean) => void;
}> = ({ data, onAnswer }) => {
    const [targets, setTargets] = useState<{ x: number; y: number; id: number; isDecoy?: boolean; num?: number; health?: number }[]>([]);
    const [clicked, setClicked] = useState(0);
    const needed = data.targetCount;

    useEffect(() => {
        const gen = (): { x: number; y: number; id: number; isDecoy?: boolean; num?: number; health?: number }[] => {
            const arr: { x: number; y: number; id: number; isDecoy?: boolean; num?: number; health?: number }[] = [];
            const total = needed + (data.variant === 'decoy' ? (data.decoys || 0) : 0);

            // Generate non-overlapping positions
            for (let i = 0; i < total; i++) {
                let x = 0, y = 0, valid = false;
                let attempts = 0;
                while (!valid && attempts < 50) {
                    x = 10 + Math.random() * 70;
                    y = 10 + Math.random() * 60;
                    valid = true;
                    // Check distance against existing points (rough percentage distance)
                    for (const existing of arr) {
                        const dx = x - existing.x;
                        const dy = y - existing.y;
                        if (Math.sqrt(dx * dx + dy * dy) < 15) { // 15% distance minimum
                            valid = false;
                            break;
                        }
                    }
                    attempts++;
                }

                arr.push({
                    x, y,
                    id: i,
                    num: data.variant === 'sequence' && i < needed ? i + 1 : undefined,
                    isDecoy: i >= needed,
                    health: data.variant === 'double' && i < needed ? 2 : 1
                });
            }

            return arr.sort(() => Math.random() - 0.5);
        };
        setTargets(gen());
        setClicked(0);
    }, [needed, data.variant, data.decoys]);

    const handleClick = useCallback(
        (t: { id: number; isDecoy?: boolean; num?: number; health?: number }) => {
            if (t.isDecoy) {
                onAnswer(false);
                return;
            }
            if (data.variant === 'sequence') {
                if (t.num !== clicked + 1) {
                    onAnswer(false);
                    return;
                }
            }
            if (data.variant === 'double' && (t.health || 0) > 1) {
                setTargets(prev => prev.map(item => item.id === t.id ? { ...item, health: item.health! - 1 } : item));
                soundManager.click();
                return;
            }

            setTargets((prev) => prev.filter((item) => item.id !== t.id));
            const newCount = clicked + 1;
            setClicked(newCount);
            if (newCount >= needed) {
                onAnswer(true);
            }
        },
        [clicked, needed, onAnswer, data.variant]
    );

    return (
        <div className="puzzle-content reaction-area">
            <div className="reaction-counter">
                {clicked}/{needed}
            </div>
            <div className="reaction-field">
                {targets.map((t) => {
                    const isTargetActive = data.variant === 'sequence' ? t.num === clicked + 1 : true;

                    let customStyle: React.CSSProperties = {};
                    if (data.variant === 'decoy') {
                        customStyle = t.isDecoy
                            ? { background: 'radial-gradient(circle, #ff5252, #d32f2f)', boxShadow: '0 0 12px rgba(255, 82, 82, 0.5)', borderColor: 'rgba(255, 82, 82, 0.3)' }
                            : { background: 'radial-gradient(circle, #00e5ff, #00b8d4)', boxShadow: '0 0 12px rgba(0, 229, 255, 0.5)', borderColor: 'rgba(0, 229, 255, 0.3)' };
                    }

                    return (
                        <button
                            key={t.id}
                            className={`reaction-target ${t.isDecoy ? 'decoy' : ''} ${data.variant === 'moving' ? 'moving' : ''} ${data.variant === 'jitter' ? 'jitter' : ''}`}
                            style={{
                                left: `${t.x}%`,
                                top: `${t.y}%`,
                                animationDelay: `${Math.random() * 2}s`,
                                opacity: isTargetActive || t.isDecoy ? 1 : 0.5,
                                ...customStyle
                            }}
                            onClick={() => handleClick(t)}
                            disabled={!isTargetActive && !t.isDecoy}
                        >
                            {t.num ? <span className="target-num">{t.num}</span> : (t.health && t.health > 1 ? '2' : '')}
                        </button>
                    );
                })}
            </div>
        </div >
    );
};

// ---- POWER-UP ----
const PowerUpRenderer: React.FC<{
    data: PowerUpPuzzleData;
    onAnswer: (correct: boolean) => void;
}> = ({ data, onAnswer }) => {
    const [progress, setProgress] = useState(0);
    const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleAction = () => {
        const newProgress = progress + 1;
        setProgress(newProgress);
        if (newProgress >= data.targetValue) {
            onAnswer(true);
        }
    };

    const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        setProgress(val);
        if (val >= data.targetValue) {
            onAnswer(true);
        }
    };

    const startHold = () => {
        if (data.actionType !== 'hold') return;
        if (holdTimerRef.current) return;
        holdTimerRef.current = setInterval(() => {
            setProgress(p => {
                const np = p + 50; // Add 50ms at a time
                if (np >= data.targetValue) {
                    onAnswer(true);
                    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
                }
                return np;
            });
        }, 50);
    };

    const stopHold = () => {
        if (holdTimerRef.current) {
            clearInterval(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        setProgress(0); // Optional: reset progress if they let go
    };

    useEffect(() => {
        return () => stopHold();
    }, []);

    return (
        <div className="puzzle-content powerup-puzzle">
            <div className="powerup-badge">
                {data.variant.toUpperCase()} INTERVENTION
            </div>
            <div className="powerup-effect">{data.effectDescription}</div>

            {data.actionType === 'spam' && (
                <button className="option-btn powerup-action-btn" onClick={handleAction}>
                    CLICK ME! ({progress}/{data.targetValue})
                </button>
            )}

            {data.actionType === 'slider' && (
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={handleSlider}
                    className="powerup-slider"
                />
            )}

            {data.actionType === 'hold' && (
                <button
                    className="option-btn powerup-action-btn"
                    onMouseDown={startHold}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={startHold}
                    onTouchEnd={stopHold}
                    style={{ background: `linear-gradient(to right, rgba(255, 215, 64, 0.4) ${(progress / data.targetValue) * 100}%, rgba(255, 215, 64, 0.1) ${(progress / data.targetValue) * 100}%)` }}
                >
                    HOLD!
                </button>
            )}
        </div>
    );
};

// ---- MAIN CARD ----
export const PuzzleCard: React.FC<PuzzleCardProps> = ({ puzzle, onSolve, onSkipPhase }) => {
    const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const dragRef = useRef({
        startX: 0, startY: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, timestamp: 0, ptrId: -1
    });
    const rafRef = useRef<number | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    const color = CATEGORY_COLORS[puzzle.category];
    const label = CATEGORY_LABELS[puzzle.category];
    const progress = puzzle.timeRemaining / puzzle.timeLimit;
    const isUrgent = progress < 0.25;
    const isExpired = puzzle.expired;

    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const handleAnswer = useCallback(
        (correct: boolean) => {
            setStatus(correct ? 'correct' : 'wrong');
            // Delay the actual solve to show the visual feedback
            setTimeout(() => {
                onSolve(puzzle.id, correct);
            }, 300);
        },
        [puzzle.id, onSolve]
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const target = e.target as HTMLElement;
        // Don't drag if clicking buttons, inputs, forms or svg elements
        if (target.closest('button, input, form, svg, .clickable-shape')) return;

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX - dragOffset.x,
            startY: e.clientY - dragOffset.y,
            lastX: e.clientX,
            lastY: e.clientY,
            vx: 0,
            vy: 0,
            timestamp: performance.now(),
            ptrId: e.pointerId
        };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || e.pointerId !== dragRef.current.ptrId) return;

        const now = performance.now();
        const dt = Math.max(1, now - dragRef.current.timestamp);

        const newX = e.clientX - dragRef.current.startX;
        const newY = e.clientY - dragRef.current.startY;

        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;

        dragRef.current.vx = dx / dt;
        dragRef.current.vy = dy / dt;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        dragRef.current.timestamp = now;

        setDragOffset({ x: newX, y: newY });
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || e.pointerId !== dragRef.current.ptrId) return;
        setIsDragging(false);
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

        let { vx, vy } = dragRef.current;
        vx *= 16;
        vy *= 16;

        let currentX = e.clientX - dragRef.current.startX;
        let currentY = e.clientY - dragRef.current.startY;

        const tick = () => {
            currentX += vx;
            currentY += vy;
            vx *= 0.93; // Friction
            vy *= 0.93;

            if (cardRef.current) {
                const rect = cardRef.current.getBoundingClientRect();
                // Playfield padding/bounds estimations
                if (rect.left < 5) {
                    currentX += (5 - rect.left);
                    vx *= -0.7;
                } else if (rect.right > window.innerWidth - 5) {
                    currentX -= (rect.right - (window.innerWidth - 5));
                    vx *= -0.7;
                }

                if (rect.top < 60) { // HUD offset
                    currentY += (60 - rect.top);
                    vy *= -0.7;
                } else if (rect.bottom > window.innerHeight - 5) {
                    currentY -= (rect.bottom - (window.innerHeight - 5));
                    vy *= -0.7;
                }
            }

            setDragOffset({ x: currentX, y: currentY });

            if (Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
            }
        };

        if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
            rafRef.current = requestAnimationFrame(tick);
        }
    };

    const renderPuzzle = () => {
        switch (puzzle.data.type) {
            case 'math':
                return <MathRenderer data={puzzle.data} onAnswer={handleAnswer} />;
            case 'pattern':
                return <PatternRenderer data={puzzle.data} onAnswer={handleAnswer} />;
            case 'language':
                return <LanguageRenderer data={puzzle.data} onAnswer={handleAnswer} />;
            case 'spatial':
                return <SpatialRenderer data={puzzle.data as SpatialPuzzleData} onAnswer={handleAnswer} />;
            case 'memory':
                return <MemoryRenderer data={puzzle.data as MemoryPuzzleData} puzzleId={puzzle.id} phase={puzzle.memoryPhase} onAnswer={handleAnswer} onSkipPhase={onSkipPhase} />;
            case 'reaction':
                return <ReactionRenderer data={puzzle.data} onAnswer={handleAnswer} />;
            case 'powerup':
                return <PowerUpRenderer data={puzzle.data as PowerUpPuzzleData} onAnswer={handleAnswer} />;
            default:
                return null;
        }
    };

    return (
        <div
            ref={cardRef}
            className={`puzzle-card ${isUrgent ? 'urgent' : ''} ${isExpired || status === 'wrong' ? 'expired' : ''} ${puzzle.isPriority ? 'priority' : ''
                } ${status === 'correct' ? 'solve-effect' : ''} ${isDragging ? 'dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={
                {
                    '--card-color': status === 'correct' ? '#76ff03' : (status === 'wrong' ? '#ff5252' : color),
                    left: `${puzzle.position.x}%`,
                    top: `${puzzle.position.y}%`,
                    transition: isDragging ? 'none' : 'box-shadow 0.2s ease-out, background 0.2s ease-out',
                    transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) ${status === 'correct' ? 'scale(1.05)' : (status === 'wrong' ? 'translateX(5px)' : '')}`,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    zIndex: isDragging ? 100 : 1
                } as React.CSSProperties
            }
        >
            <div className="card-header">
                <span className="card-category">{label}</span>
                <span className="card-points">+{puzzle.basePoints}</span>
            </div>
            <div className="card-instruction">{puzzle.instruction}</div>
            {renderPuzzle()}
            <div className="timer-bar">
                <div
                    className="timer-fill"
                    style={{
                        width: `${progress * 100}%`,
                        backgroundColor: isUrgent ? '#ff5252' : color,
                    }}
                />
            </div>
        </div>
    );
};
