'use client';

import { useEffect, useState } from 'react';
import Editor, { EditorProps, loader } from '@monaco-editor/react';

export default function DynamicMonacoEditor(props: EditorProps) {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        import('monaco-editor').then(monaco => {
            loader.config({ monaco });
            setReady(true);
        });
    }, []);

    if (!ready) {
        return <div className="flex-1 flex items-center justify-center p-4 text-site-text-muted">Initializing Editor...</div>;
    }

    return <Editor {...props} />;
}
