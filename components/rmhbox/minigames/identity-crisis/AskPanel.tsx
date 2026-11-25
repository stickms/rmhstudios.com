/**
 * AskPanel — the asker types one yes-or-no question about themselves.
 *
 * A single-line field (Enter sends), a character count and a send button. The
 * text is member text: it carries `dir="auto"` while it is typed and wherever it
 * is shown. The server cleans it and checks 3 to 200 characters; the field only
 * stops sooner.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';

const MAX_LENGTH = 200;
const MIN_LENGTH = 3;

interface AskPanelProps {
  onAsk: (text: string) => void;
}

export default function AskPanel({ onAsk }: AskPanelProps) {
  const { t } = useTranslation('identity-crisis');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Take focus when the turn starts, unless the player is already typing somewhere
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) inputRef.current?.focus();
  }, []);

  const trimmed = text.trim();
  const valid = trimmed.length >= MIN_LENGTH && !sent;

  const submit = () => {
    if (!valid) return;
    setSent(true);
    onAsk(trimmed);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="ic-ask">
      <label htmlFor="ic-ask-input" className="text-sm font-semibold text-app-text">
        {t('ask-label', { defaultValue: 'Ask the table a yes-or-no question about who you are' })}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="ic-ask-input"
          ref={inputRef}
          type="text"
          dir="auto"
          value={text}
          maxLength={MAX_LENGTH}
          disabled={sent}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={t('ask-placeholder', { defaultValue: 'Am I a real person?' })}
          className="min-w-0 flex-1 rounded-app-sm border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          className="flex items-center gap-2 rounded-app-sm bg-app-accent px-4 py-2 text-sm font-medium text-app-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {t('ask-send', { defaultValue: 'Ask' })}
        </button>
      </div>
      <p className="text-xs text-app-text-muted">
        {sent
          ? t('ask-sent', { defaultValue: 'Question sent.' })
          : t('ask-count', { defaultValue: '{{count}} of {{max}} characters', count: text.length, max: MAX_LENGTH })}
      </p>
    </div>
  );
}
