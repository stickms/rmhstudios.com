'use client';

import { useState, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';

interface TestResult {
    id: number;
    passed: boolean;
    label: string;
}

interface FakeTestResultsProps {
    totalTests: number;
    passedTests: number;
    isRunning: boolean;
    onComplete?: () => void;
}

export function FakeTestResults({ totalTests, passedTests, isRunning, onComplete }: FakeTestResultsProps) {
    const [visibleResults, setVisibleResults] = useState<TestResult[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (!isRunning) {
            setVisibleResults([]);
            setCurrentIndex(0);
            return;
        }

        const results: TestResult[] = [];
        for (let i = 0; i < Math.min(20, totalTests); i++) {
            results.push({
                id: i,
                passed: i < Math.min(passedTests, 20),
                label: `Test Case ${i + 1}`,
            });
        }

        // Shuffle so passes and fails are intermixed (with bias toward early passes)
        for (let i = results.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [results[i], results[j]] = [results[j], results[i]];
        }

        let idx = 0;
        const interval = setInterval(() => {
            if (idx >= results.length) {
                clearInterval(interval);
                onComplete?.();
                return;
            }
            setVisibleResults((prev) => [...prev, results[idx]]);
            setCurrentIndex(idx + 1);
            idx++;
        }, 150 + Math.random() * 200);

        return () => clearInterval(interval);
    }, [isRunning, totalTests, passedTests, onComplete]);

    if (!isRunning && visibleResults.length === 0) return null;

    return (
        <div
            className="p-3 rounded-lg text-xs font-mono space-y-1 max-h-60 overflow-y-auto"
            style={{ background: 'var(--jobs-surface-2)', borderRadius: 'var(--jobs-radius)' }}
        >
            <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--jobs-text-muted)' }}>
                {isRunning && currentIndex < 20 ? (
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
            {visibleResults.map((result) => (
                <div key={result.id} className={result.passed ? 'test-result-pass' : 'test-result-fail'}>
                    <span className="inline-flex items-center gap-1.5">
                        {result.passed ? <Check size={10} /> : <X size={10} />}
                        {result.label}: {result.passed ? 'Passed' : 'Time Limit Exceeded'}
                    </span>
                </div>
            ))}
        </div>
    );
}
