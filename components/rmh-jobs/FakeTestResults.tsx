'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, X, Loader2 } from 'lucide-react';

interface TestResult {
    caseNumber: number;
    passed: boolean;
}

interface FakeTestResultsProps {
    totalTests: number;
    passedTests: number;
    isRunning: boolean;
    onComplete?: () => void;
}

export function FakeTestResults({ totalTests, passedTests, isRunning, onComplete }: FakeTestResultsProps) {
    const [visibleResults, setVisibleResults] = useState<TestResult[]>([]);
    const generatedRef = useRef<TestResult[]>([]);
    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    useEffect(() => {
        if (!isRunning) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setVisibleResults([]);
            generatedRef.current = [];
            return;
        }

        const displayCount = Math.min(20, totalTests);
        const passedSet = new Set<number>();
        while (passedSet.size < Math.min(passedTests, displayCount)) {
            passedSet.add(Math.floor(Math.random() * displayCount));
        }

        const results: TestResult[] = [];
        for (let i = 0; i < displayCount; i++) {
            results.push({ caseNumber: i + 1, passed: passedSet.has(i) });
        }
        generatedRef.current = results;

        let idx = 0;
        intervalRef.current = setInterval(() => {
            if (idx >= generatedRef.current.length) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                onCompleteRef.current?.();
                return;
            }
            const next = generatedRef.current[idx];
            setVisibleResults((prev) => [...prev, next]);
            idx++;
        }, 150 + Math.random() * 200);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    // Only re-run when isRunning transitions to true
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRunning]);

    if (!isRunning && visibleResults.length === 0) return null;

    const doneCount = visibleResults.length;
    const displayCount = Math.min(20, totalTests);

    return (
        <div
            className="p-3 rounded-lg text-xs font-mono space-y-1 max-h-60 overflow-y-auto"
            style={{ background: 'var(--jobs-surface-2)', borderRadius: 'var(--jobs-radius)' }}
        >
            <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--jobs-text-muted)' }}>
                {isRunning && doneCount < displayCount ? (
                    <>
                        <Loader2 size={12} className="animate-spin" />
                        Running against {totalTests} test cases...
                    </>
                ) : (
                    <span>
                        {passedTests}/{totalTests} test cases passed
                        {passedTests < totalTests && ' — Time Limit Exceeded on remaining'}
                    </span>
                )}
            </div>
            {visibleResults.map((result, idx) => (
                <div key={idx} className={result.passed ? 'test-result-pass' : 'test-result-fail'}>
                    <span className="inline-flex items-center gap-1.5">
                        {result.passed ? <Check size={10} /> : <X size={10} />}
                        Test Case {result.caseNumber}: {result.passed ? 'Passed' : 'Time Limit Exceeded'}
                    </span>
                </div>
            ))}
        </div>
    );
}
