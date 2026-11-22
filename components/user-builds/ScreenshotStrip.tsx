/**
 * The row of screenshots under a build's description (s07-17). Each picture is a button that opens the viewer, which
 * is loaded the first time one is used. Pictures sit in a box on `--site-bg-subtle` with a 1px border and an 8px
 * radius (S4); width and height are on every image so the page reserves the space, and they load lazily.
 */
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenshotView } from '@/lib/builds/screenshots';

const ScreenshotViewer = lazy(() => import('./ScreenshotViewer'));

export function ScreenshotStrip({ items }: { items: readonly ScreenshotView[] }) {
  const { t } = useTranslation('build-screenshots');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Kept once opened so the dialog can finish closing before it unmounts.
  const [everOpened, setEverOpened] = useState(false);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="build-screenshots-heading" className="space-y-3">
      <h2 id="build-screenshots-heading" className="t-heading">
        {t('heading', {
          defaultValue: 'Screenshots',
        })}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <li key={item.url}>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                setEverOpened(true);
                setOpenIndex(i);
              }}
              className="block aspect-video w-full overflow-hidden rounded-site border border-site-border bg-site-bg-subtle"
            >
              <img
                src={item.url}
                alt={item.description}
                width={item.width}
                height={item.height}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {everOpened && (
        <Suspense fallback={null}>
          <ScreenshotViewer
            items={items}
            index={openIndex ?? 0}
            onIndexChange={setOpenIndex}
            open={openIndex !== null}
            onOpenChange={(open) => {
              if (!open) setOpenIndex(null);
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
