// Lightweight keyboard tracker — returns a ref to the set of held key codes.
import { useEffect, useRef } from 'react';

export function isTypingTarget(): boolean {
    if (typeof document === 'undefined') return false;
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

export function useKeyboard() {
    const keys = useRef<Set<string>>(new Set());
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (isTypingTarget()) return;
            keys.current.add(e.code);
        };
        const up = (e: KeyboardEvent) => keys.current.delete(e.code);
        const clear = () => keys.current.clear();
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', clear);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', clear);
        };
    }, []);
    return keys;
}
