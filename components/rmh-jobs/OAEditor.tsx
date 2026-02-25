'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Play, Send, ChevronDown, Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { FakeTestResults } from './FakeTestResults';

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.default), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full" style={{ color: 'var(--jobs-text-muted)' }}>
            Loading editor...
        </div>
    ),
});

interface OAEditorProps {
    problem: {
        id: string;
        title: string;
        difficulty: string;
        complexityRequirement: string;
        gameReference: string;
        description: string;
        examples: { input: string; output: string; explanation: string }[];
        constraints: string[];
        starterCode: Record<string, string>;
        timeLimit: number;
    };
    job: { title: string; company: string };
    assessmentId: string;
    startedAt: string;
    initialCode?: string;
    initialLanguage?: string;
    isSubmitted: boolean;
    existingResult?: {
        evaluationResult: string;
        totalTests: number;
        passedTests: number;
        message: string;
        rejectionMessage: string;
    } | null;
}

const LANGUAGES = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'python', label: 'Python' },
    { value: 'typescript', label: 'TypeScript' },
];

const MONACO_LANG_MAP: Record<string, string> = {
    javascript: 'javascript',
    python: 'python',
    typescript: 'typescript',
};

export function OAEditor({
    problem,
    job,
    assessmentId,
    startedAt,
    initialCode,
    initialLanguage,
    isSubmitted: initialSubmitted,
}: OAEditorProps) {
    const [language, setLanguage] = useState(initialLanguage ?? 'javascript');
    const [code, setCode] = useState(initialCode ?? problem.starterCode[language] ?? '');
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isSubmitted, setIsSubmitted] = useState(initialSubmitted);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [runPassedTests, setRunPassedTests] = useState(0);
    const [runResults, setRunResults] = useState<{
        totalTests: number;
        passedTests: number;
        message: string;
    } | null>(null);
    const [showLangDropdown, setShowLangDropdown] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [checkAnimated, setCheckAnimated] = useState(false);
    const hasAutoSubmittedRef = useRef(false);

    useEffect(() => {
        const start = new Date(startedAt).getTime();
        const deadline = start + problem.timeLimit * 60 * 1000;

        const tick = () => {
            const remaining = Math.max(0, deadline - Date.now());
            setTimeLeft(remaining);
            if (remaining <= 0 && !isSubmitted && !hasAutoSubmittedRef.current) {
                hasAutoSubmittedRef.current = true;
                doSubmit();
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startedAt, problem.timeLimit, isSubmitted]);

    const handleLanguageChange = (lang: string) => {
        setLanguage(lang);
        if (!code || code === problem.starterCode[language]) {
            setCode(problem.starterCode[lang] ?? '');
        }
        setShowLangDropdown(false);
    };

    const handleRun = () => {
        const passed = Math.random() < 0.3;
        const count = passed ? 3 : Math.floor(Math.random() * 3) + 1;
        setRunPassedTests(count);
        setRunResults(null);
        setIsRunning(true);
    };

    const handleRunComplete = useCallback(() => {
        setIsRunning(false);
        setRunResults({
            totalTests: 247,
            passedTests: 0,
            message: 'Run complete',
        });
    }, []);

    const handleSubmitClick = () => {
        if (isSubmitted || isSubmitting) return;
        setShowConfirm(true);
    };

    const doSubmit = async () => {
        if (isSubmitted || isSubmitting) return;
        setShowConfirm(false);
        setIsSubmitting(true);
        setIsRunning(false);

        try {
            const res = await fetch(`/api/rmh-jobs/assessment/${assessmentId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language }),
            });

            if (res.ok) {
                setIsSubmitted(true);
                setShowSuccess(true);
                setTimeout(() => setCheckAnimated(true), 100);
            }
        } catch {
            // Ignore
        } finally {
            setIsSubmitting(false);
        }
    };

    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    const isUrgent = timeLeft < 2 * 60 * 1000 && timeLeft > 0;

    if (showSuccess) {
        return (
            <div className="flex flex-col h-screen items-center justify-center" style={{ background: 'var(--jobs-bg)' }}>
                <div className="text-center max-w-md mx-auto px-4">
                    <div
                        className="mx-auto mb-6 flex items-center justify-center rounded-full transition-all duration-700 ease-out"
                        style={{
                            width: checkAnimated ? 80 : 0,
                            height: checkAnimated ? 80 : 0,
                            background: '#22c55e',
                            opacity: checkAnimated ? 1 : 0,
                            transform: checkAnimated ? 'scale(1)' : 'scale(0.3)',
                        }}
                    >
                        <Check
                            size={40}
                            strokeWidth={3}
                            color="white"
                            style={{
                                opacity: checkAnimated ? 1 : 0,
                                transition: 'opacity 0.4s ease 0.3s',
                            }}
                        />
                    </div>
                    <h1 className="text-2xl font-bold mb-3">Assessment Submitted</h1>
                    <p className="text-sm mb-2" style={{ color: 'var(--jobs-text-muted)' }}>
                        Your Online Assessment for <strong>{job.title}</strong> at <strong>{job.company}</strong> has been submitted successfully.
                    </p>
                    <p className="text-sm mb-8" style={{ color: 'var(--jobs-text-subtle)' }}>
                        Your submission is under review. You will be notified of the results.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href="/rmh-jobs"
                            className="jobs-btn-primary px-6 py-2.5 rounded-lg text-sm inline-block"
                            style={{ borderRadius: 'var(--jobs-radius)' }}
                        >
                            Return to RMH Jobs Portal
                        </Link>
                        <Link
                            href="/rmh-jobs/applications"
                            className="jobs-btn-secondary px-6 py-2.5 rounded-lg text-sm inline-block"
                            style={{ borderRadius: 'var(--jobs-radius)' }}
                        >
                            View My Applications
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen">
            {/* Header */}
            <header
                className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                style={{ background: 'var(--jobs-surface)', borderColor: 'var(--jobs-border)' }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono" style={{ color: 'var(--jobs-accent)' }}>
                        RMH STUDIOS
                    </span>
                    <span className="text-xs" style={{ color: 'var(--jobs-text-subtle)' }}>|</span>
                    <span className="text-xs" style={{ color: 'var(--jobs-text-muted)' }}>
                        Online Assessment — {job.company}
                    </span>
                </div>
                <div className={`flex items-center gap-1.5 font-mono text-sm ${isUrgent ? 'timer-urgent' : ''}`} style={{ color: isUrgent ? undefined : 'var(--jobs-text)' }}>
                    <Clock size={14} />
                    {timeLeft <= 0 ? (
                        <span>Time&apos;s up</span>
                    ) : (
                        <span>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
                    )}
                </div>
            </header>

            {/* Main content */}
            <div className="flex flex-1 min-h-0">
                {/* Problem description (left) */}
                <div
                    className="w-[45%] border-r overflow-y-auto p-5"
                    style={{ borderColor: 'var(--jobs-border)' }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <span
                            className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{ background: 'var(--jobs-danger-dim)', color: 'var(--jobs-danger)' }}
                        >
                            {problem.difficulty}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--jobs-text-subtle)' }}>
                            Required: {problem.complexityRequirement}
                        </span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--jobs-text-subtle)' }}>
                            {problem.gameReference}
                        </span>
                    </div>

                    <div className="prose prose-invert prose-sm max-w-none">
                        <div
                            className="whitespace-pre-wrap text-sm leading-relaxed"
                            style={{ color: 'var(--jobs-text)' }}
                            dangerouslySetInnerHTML={{
                                __html: formatProblemDescription(problem.description),
                            }}
                        />

                        <div className="mt-6">
                            <h4 className="font-semibold text-sm mb-3" style={{ color: 'var(--jobs-text)' }}>Examples</h4>
                            {problem.examples.map((ex, i) => (
                                <div
                                    key={i}
                                    className="p-3 rounded-lg mb-3 text-xs font-mono"
                                    style={{ background: 'var(--jobs-surface-2)', borderRadius: 'var(--jobs-radius-sm)' }}
                                >
                                    <div className="mb-2">
                                        <span className="font-semibold" style={{ color: 'var(--jobs-text-muted)' }}>Input:</span>
                                        <pre className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--jobs-text)' }}>{ex.input}</pre>
                                    </div>
                                    <div className="mb-2">
                                        <span className="font-semibold" style={{ color: 'var(--jobs-text-muted)' }}>Output:</span>
                                        <pre className="mt-1" style={{ color: 'var(--jobs-accent)' }}>{ex.output}</pre>
                                    </div>
                                    <div>
                                        <span className="font-semibold" style={{ color: 'var(--jobs-text-muted)' }}>Explanation:</span>
                                        <p className="mt-1" style={{ color: 'var(--jobs-text-muted)' }}>{ex.explanation}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6">
                            <h4 className="font-semibold text-sm mb-2" style={{ color: 'var(--jobs-text)' }}>Constraints</h4>
                            <ul className="space-y-1">
                                {problem.constraints.map((c, i) => (
                                    <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'var(--jobs-text-muted)' }}>
                                        <span style={{ color: 'var(--jobs-accent)' }}>•</span>
                                        {c}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Editor (right) */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Editor toolbar */}
                    <div
                        className="flex items-center justify-between px-3 py-1.5 border-b shrink-0"
                        style={{ background: 'var(--jobs-surface-2)', borderColor: 'var(--jobs-border)' }}
                    >
                        <div className="relative">
                            <button
                                onClick={() => setShowLangDropdown(!showLangDropdown)}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-(--jobs-surface-3) transition-colors"
                                style={{ color: 'var(--jobs-text-muted)' }}
                                disabled={isSubmitted}
                            >
                                {LANGUAGES.find((l) => l.value === language)?.label}
                                <ChevronDown size={12} />
                            </button>
                            {showLangDropdown && (
                                <div
                                    className="absolute top-full left-0 mt-1 rounded-lg border z-10 overflow-hidden"
                                    style={{ background: 'var(--jobs-surface)', borderColor: 'var(--jobs-border)', borderRadius: 'var(--jobs-radius-sm)' }}
                                >
                                    {LANGUAGES.map((l) => (
                                        <button
                                            key={l.value}
                                            onClick={() => handleLanguageChange(l.value)}
                                            className="block w-full text-left text-xs px-3 py-1.5 hover:bg-(--jobs-surface-2) transition-colors"
                                            style={{ color: language === l.value ? 'var(--jobs-accent)' : 'var(--jobs-text-muted)' }}
                                        >
                                            {l.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRun}
                                disabled={isSubmitted || isRunning}
                                className="jobs-btn-secondary flex items-center gap-1 text-xs px-2.5 py-1 rounded"
                                style={{ borderRadius: 'var(--jobs-radius-sm)' }}
                            >
                                <Play size={11} />
                                Run
                            </button>
                            <button
                                onClick={handleSubmitClick}
                                disabled={isSubmitted || isSubmitting}
                                className="jobs-btn-primary flex items-center gap-1 text-xs px-2.5 py-1 rounded"
                                style={{ borderRadius: 'var(--jobs-radius-sm)' }}
                            >
                                <Send size={11} />
                                {isSubmitting ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    </div>

                    {/* Monaco Editor */}
                    <div className="flex-1 min-h-0">
                        <MonacoEditor
                            height="100%"
                            language={MONACO_LANG_MAP[language] ?? 'javascript'}
                            value={code}
                            onChange={(v) => setCode(v ?? '')}
                            theme="vs-dark"
                            options={{
                                fontSize: 13,
                                minimap: { enabled: false },
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                                readOnly: isSubmitted,
                                padding: { top: 12 },
                            }}
                        />
                    </div>

                    {/* Test results panel (only for Run, not Submit) */}
                    {(isRunning || runResults) && (
                        <div
                            className="border-t p-3 shrink-0 max-h-64 overflow-y-auto"
                            style={{ borderColor: 'var(--jobs-border)', background: 'var(--jobs-surface)' }}
                        >
                            {isRunning ? (
                                <FakeTestResults
                                    totalTests={247}
                                    passedTests={runPassedTests}
                                    isRunning={isRunning}
                                    onComplete={handleRunComplete}
                                />
                            ) : runResults ? (
                                <div className="space-y-2">
                                    <p className="text-xs font-mono" style={{ color: 'var(--jobs-danger)' }}>
                                        {runResults.passedTests}/{runResults.totalTests} test cases passed — Time Limit Exceeded on remaining
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            {/* Confirmation modal */}
            {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div
                        className="p-6 rounded-xl border max-w-md w-full mx-4"
                        style={{ background: 'var(--jobs-surface)', borderColor: 'var(--jobs-border)', borderRadius: 'var(--jobs-radius-lg)' }}
                    >
                        <h3 className="text-lg font-bold mb-2">Submit Assessment?</h3>
                        <p className="text-sm mb-6" style={{ color: 'var(--jobs-text-muted)' }}>
                            Are you sure you want to submit your solution? This action cannot be undone and your assessment will be
                            sent for evaluation.
                        </p>
                        <div className="flex items-center gap-3 justify-end">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="jobs-btn-secondary px-4 py-2 rounded-lg text-sm"
                                style={{ borderRadius: 'var(--jobs-radius)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={doSubmit}
                                className="jobs-btn-primary px-4 py-2 rounded-lg text-sm"
                                style={{ borderRadius: 'var(--jobs-radius)' }}
                            >
                                Yes, Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatProblemDescription(md: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return esc(md)
        .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold mb-3">$1</h2>')
        .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code style="background:var(--jobs-surface-2);padding:1px 4px;border-radius:3px;font-size:0.85em">$1</code>')
        .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:2px solid var(--jobs-accent);padding-left:12px;color:var(--jobs-text-muted);font-style:italic;margin:8px 0">$1</blockquote>')
        .replace(/\n\n/g, '<br/><br/>');
}
