import { useId } from 'react';
import { Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LISTEN_RATES } from '@/lib/reading/listen-prefs';
import { isListenDelay } from '@/lib/study/listen';
import type { CardListen } from '@/components/study/useCardListen';

/**
 * The "Listen" switch of a review session and what goes with it (s11-17): how long the front waits before the answer
 * is shown, the speed, a replay (the `a` key), and the one line said when a side is only a picture. The words being
 * said are the card on screen, so nothing here repeats them.
 */
export function ListenControls({ listen }: { listen: CardListen }) {
  const { t } = useTranslation('card-listen');
  const uid = useId();
  return (
    <div className="border-b border-site-border pb-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 text-site-text-muted" aria-hidden />
          <span id={`${uid}-label`} className="t-body font-medium">
            {t('listen', {
              defaultValue: 'Listen',
            })}
          </span>
          <Switch
            checked={listen.on}
            disabled={!listen.supported}
            onCheckedChange={listen.setOn}
            aria-labelledby={`${uid}-label`}
            aria-describedby={listen.supported ? undefined : `${uid}-unsupported`}
          />
        </div>
        {listen.on && (
          <>
            <Select
              controlSize="sm"
              value={listen.delay}
              aria-label={t('delay-label', {
                defaultValue: 'Show the answer after',
              })}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (isListenDelay(next)) listen.setDelay(next);
              }}
            >
              <option value={3}>
                {t('delay-3', {
                  defaultValue: '3 seconds',
                })}
              </option>
              <option value={5}>
                {t('delay-5', {
                  defaultValue: '5 seconds',
                })}
              </option>
              <option value={8}>
                {t('delay-8', {
                  defaultValue: '8 seconds',
                })}
              </option>
              <option value={0}>
                {t('delay-wait', {
                  defaultValue: 'Wait for me',
                })}
              </option>
            </Select>
            <Select
              controlSize="sm"
              value={listen.rate}
              aria-label={t('speed-label', {
                defaultValue: 'Speed',
              })}
              onChange={(e) => listen.setRate(Number(e.target.value))}
            >
              {LISTEN_RATES.map((r) => (
                <option key={r} value={r}>{`${r}×`}</option>
              ))}
            </Select>
            <Button type="button" variant="ghost" size="sm" aria-keyshortcuts="a" onClick={listen.replay}>
              {t('replay', {
                defaultValue: 'Play again',
              })}
              <span className="t-meta ms-2" aria-hidden>
                a
              </span>
            </Button>
          </>
        )}
      </div>
      {!listen.supported && (
        <p id={`${uid}-unsupported`} className="t-meta mt-2">
          {t('unsupported', {
            defaultValue: 'Your browser cannot read aloud',
          })}
        </p>
      )}
      {listen.pictureOnly && (
        <p role="status" className="t-meta mt-2">
          {t('picture-card', {
            defaultValue: 'This card has a picture; look to answer',
          })}
        </p>
      )}
    </div>
  );
}
