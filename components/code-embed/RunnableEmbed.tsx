import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildSrcdoc } from '@/lib/code-embed/shared';
import { postEmbedApi } from '@/lib/feed/rmhark-actions.contract';
import { api } from '@/lib/contract/client';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/**
 * A post's code snippet (F14). Nothing is fetched or run until the reader presses
 * Run; the snippet then runs in an opaque-origin sandbox (scripts only, no
 * same-origin, no network via the srcdoc CSP).
 */
export function RunnableEmbed({ postId }: { postId: string }) {
  const { t } = useTranslation('f-creative');
  const [doc, setDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const arrival = useArrival(doc !== null);

  const run = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setDoc(buildSrcdoc(await api(postEmbedApi, { params: { id: postId } })));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-site">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-medium text-site-text-muted">
          {t('run-label', { defaultValue: 'Code snippet' })}
        </span>
        {doc === null ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={loading}
            onClick={(e) => {
              e.stopPropagation();
              void run();
            }}
          >
            <Play />
            {loading
              ? t('run-loading', { defaultValue: 'Loading…' })
              : t('run-button', { defaultValue: 'Run' })}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setDoc(null);
            }}
          >
            <Square />
            {t('run-stop', { defaultValue: 'Stop' })}
          </Button>
        )}
      </div>
      {failed && (
        <p className="px-3 pb-2 text-xs text-site-danger">
          {t('run-failed', { defaultValue: 'Could not load the snippet.' })}
        </p>
      )}
      {doc !== null && (
        <iframe
          title={t('run-frame', { defaultValue: 'Code snippet output' })}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={doc}
          loading="lazy"
          className={cn('block h-60 w-full border-0', arrival)}
        />
      )}
    </div>
  );
}
