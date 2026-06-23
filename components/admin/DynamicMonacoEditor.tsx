'use client';

import { useEffect, useState } from 'react';
import Editor, { EditorProps, loader } from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';

export default function DynamicMonacoEditor(props: EditorProps) {
    const { t } = useTranslation('c-admin');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        import('monaco-editor').then(monaco => {
            loader.config({ monaco });
            setReady(true);
        });
    }, []);

    if (!ready) {
        return <div className="flex-1 flex items-center justify-center p-4 text-site-text-muted">{t("initializing-editor", { defaultValue: "Initializing Editor..." })}</div>;
    }

    return <Editor {...props} />;
}
