// RMH Farming Simulator — minimal co-op chat overlay.
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import { actions } from '@/lib/rmh-farming-sim/socket';

export default function ChatBox() {
    const chat = useRfsStore((s) => s.chat);
    const [text, setText] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [chat]);

    const send = () => {
        const t = text.trim();
        if (!t) return;
        actions.chat(t);
        setText('');
    };

    return (
        <div className={`rfs-chat ${collapsed ? 'collapsed' : ''}`}>
            <div className="rfs-chat-head" onClick={() => setCollapsed((c) => !c)}>
                💬 Chat {collapsed ? '▸' : '▾'}
            </div>
            {!collapsed && (
                <>
                    <div className="rfs-chat-log" ref={scrollRef}>
                        {chat.length === 0 && <div className="rfs-chat-empty">Say hi to your crew…</div>}
                        {chat.map((m, i) => (
                            <div className="rfs-chat-line" key={`${m.ts}-${i}`}>
                                <span className="rfs-chat-name">{m.name}:</span> {m.text}
                            </div>
                        ))}
                    </div>
                    <div className="rfs-chat-input">
                        <input
                            value={text}
                            placeholder="Press Enter to send…"
                            maxLength={160}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') send();
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
