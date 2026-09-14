'use client';

/**
 * The tasting menu — the globe, the course it is holding, and the nine courses
 * as text.
 *
 * The globe and the list are two views of one selection, not a picture beside a
 * menu: turning the sphere moves the list's pressed state, pressing a list
 * button turns the sphere. The list is also the whole accessible path, which is
 * why it renders every course's name, temperature and pairing rather than
 * acting as nine anonymous dots — a keyboard reader gets the menu, not a
 * description of a menu they cannot see.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Thermometer, Wine, CircleAlert, Beaker } from 'lucide-react';
import { COURSES } from '@/lib/rebar-rutabaga/menu';
import { cn } from '@/lib/utils';
import { MenuGlobe } from './MenuGlobe';
import { courseText } from './copy';

/** `01`, `09` — the running order, as a kitchen writes it on the board. */
function courseNo(no: number) {
  return no < 10 ? `0${no}` : String(no);
}

export function TastingMenu() {
  const { t } = useTranslation('c-rebar-rutabaga');
  const [selected, setSelected] = useState(0);
  const course = COURSES[selected] ?? COURSES[0]!;
  const text = courseText(course.id, t);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        <div className="glass-pane rounded-site p-4">
          <MenuGlobe selected={selected} onSelect={setSelected} />
          <p className="mt-3 text-center text-xs text-site-text-muted">
            {t('globe.hint', {
              defaultValue: 'Drag to turn it. Press it and it ripples. Pearls are drawn to size.',
            })}
          </p>
        </div>

        <article className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-site-accent">
            {t('course.counter', {
              defaultValue: 'Course {{no}} of {{total}}',
              no: courseNo(course.no),
              total: courseNo(COURSES.length),
            })}
          </p>

          {course.signature ? (
            <p className="mt-3 inline-block bg-rebar-sulphur px-2 py-1 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-rebar-sulphur-ink">
              {t('course.signature', { defaultValue: 'The one on the sign' })}
            </p>
          ) : null}

          <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.02em] text-site-text sm:text-3xl">
            {text.name}
          </h3>

          <p className="mt-4 max-w-prose text-site-text-muted">{text.blurb}</p>

          <dl className="mt-6 grid gap-px overflow-hidden rounded-site border border-site-border bg-site-border sm:grid-cols-2">
            <Spec
              icon={Beaker}
              label={t('spec.bath', { defaultValue: 'Bath' })}
              value={text.bath}
            />
            <Spec
              icon={Thermometer}
              label={t('spec.temp', { defaultValue: 'Serve temp' })}
              value={t('spec.tempValue', { defaultValue: '{{c}} °C', c: course.tempC })}
            />
            <Spec
              icon={Wine}
              label={t('spec.pairing', { defaultValue: 'Pairing' })}
              value={text.pairing}
            />
            <Spec
              icon={CircleAlert}
              label={t('spec.allergens', { defaultValue: 'Allergens' })}
              value={text.allergens}
            />
          </dl>
        </article>
      </div>

      <section>
        <h3 className="font-display text-lg font-semibold uppercase tracking-[0.02em] text-site-text">
          {t('card.title', { defaultValue: 'The menu, as printed' })}
        </h3>
        <ul className="mt-3 flex flex-col gap-px rounded-site bg-site-border p-px">
          {COURSES.map((c, i) => {
            const row = courseText(c.id, t);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={i === selected}
                  onClick={() => setSelected(i)}
                  data-fluid-press
                  className={cn(
                    'glass-fill flex w-full flex-col gap-1 p-4 text-left transition-colors duration-200',
                    'sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_5rem_13rem] sm:items-baseline sm:gap-4',
                    i === selected ? 'text-site-text' : 'text-site-text-muted hover:text-site-text',
                  )}
                >
                  <span
                    className={cn(
                      'font-mono text-xs tabular-nums',
                      i === selected ? 'text-site-accent' : 'text-site-text-muted',
                    )}
                  >
                    {courseNo(c.no)}
                  </span>
                  <span className="font-display font-medium uppercase">{row.name}</span>
                  <span className="font-mono text-xs tabular-nums">
                    {t('spec.tempValue', { defaultValue: '{{c}} °C', c: c.tempC })}
                  </span>
                  <span className="text-sm italic text-site-text-muted">{row.pairing}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Spec({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-fill flex items-start gap-3 p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-site-accent" aria-hidden />
      <div className="min-w-0">
        <dt className="font-mono text-xs uppercase tracking-[0.09em] text-site-text-muted">
          {label}
        </dt>
        <dd className="mt-1 font-mono text-sm tabular-nums text-site-text">{value}</dd>
      </div>
    </div>
  );
}
