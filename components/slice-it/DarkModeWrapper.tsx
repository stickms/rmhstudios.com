import { useEffect } from 'react';
import { useGameStore } from '@/lib/store/useGameStore';

/**
 * Applies dark mode class to the nearest slice-theme ancestor
 * so the header, sidebar, and entire page background all go dark gray.
 */
export function DarkModeWrapper({ children }: { children: React.ReactNode }) {
    const isDarkMode = useGameStore(state => state.isDarkMode);

    useEffect(() => {
        // Apply dark class to document so the entire page (header, bg) turns dark
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        return () => {
            document.documentElement.classList.remove('dark');
        };
    }, [isDarkMode]);

    return <>{children}</>;
}
