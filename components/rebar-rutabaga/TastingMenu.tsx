'use client';

/**
 * The tasting menu — the globe, the course it is holding, and the carte.
 *
 * Still two views of one selection, as before: turning the sphere moves the
 * carte's pressed row, pressing a row turns the sphere. What changed in the
 * redesign is everything around that, and the reasons are worth keeping.
 *
 * **The globe finally gets a stage.** Previously it sat in a 420px column
 * beside a wall of specification, which is a diagram's treatment. Here the
 * panel it lives on is the only surface on the entire page that comes forward —
 * the one plane above the plaster — and it is the only place the liquid glass
 * appears. Scarcity is what makes it read as a material rather than a style.
 *
 * **The specs are a rule-separated list, not four glass tiles.** Boxing four
 * short facts produced four competing rectangles; a printed menu would set them
 * as a column of rules with the label in the margin, which is also how a reader
 * scans for one of them.
 *
 * **The carte is the accessible path and looks like the real object.** Nine
 * rows, numbered, hairline between, name in the display face, temperature and
 * pairing in the margin. A keyboard reader gets the menu itself — not nine
 * anonymous dots and a description of a sphere they cannot see.
 *
 * The signature course is the only place on the page the sulphur appears
 * besides the hazard rule. One accent, used twice, both times meaning
 * something.
 */

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { COURSES } from '@/lib/rebar-rutabaga/menu';
import { cn } from '@/lib/utils';
import { MenuGlobe } from './MenuGlobe';
import { courseText } from './copy';
import { Reveal, DrawnRule, stagger, swapVariants } from './Reveal';

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
    <section
      aria-labelledby="rr-menu"
      className="border-t border-rebar-line bg-rebar-paper-sunk"
    >
      <div className="mx-auto max-w-[86rem] px-6 py-24 sm:px-10 sm:py-32">
        <Reveal>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.26em] text-rebar-ink-faint">
            {t('menu.eyebrow', { defaultValue: 'The carte · nine courses' })}
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          <h2
            id="rr-menu"
            className="mt-6 max-w-[24ch] font-display text-[clamp(2.2rem,5.5vw,4.25rem)] font-light leading-[0.95] tracking-[-0.035em] text-rebar-ink"
          >
            {t('menu.title', { defaultValue: 'Turn the globe.' })}
          </h2>
        </Reveal>
        <DrawnRule className="mt-12" delay={0.1} />

        <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-20">
          {/* The one raised plane on the page, and the only liquid glass. */}
          <Reveal delay={0.12}>
            <div className="glass-pane rounded-none p-5 sm:p-7">
              <MenuGlobe selected={selected} onSelect={setSelected} />
            </div>
            <p className="mt-4 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
              {t('globe.hint', {
                defaultValue: 'Drag to turn it · pearls are drawn to size',
              })}
            </p>
          </Reveal>

          {/* The held course. Keyed on the id so a change cross-fades rather
              than mutating six strings in place under the reader's eye. */}
          <Reveal delay={0.18}>
            <AnimatePresence mode="wait">
              <motion.article
                key={course.id}
                variants={swapVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="min-w-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-rebar-ink-soft">
                    {courseNo(course.no)} / {courseNo(COURSES.length)}
                  </p>
                  {course.signature ? (
                    <p className="bg-rebar-sulphur px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-rebar-sulphur-ink">
                      {t('course.signature', { defaultValue: 'The one on the sign' })}
                    </p>
                  ) : null}
                </div>

                <h3 className="mt-5 font-display text-[clamp(1.9rem,4vw,3rem)] font-light leading-[1.02] tracking-[-0.03em] text-rebar-ink">
                  {text.name}
                </h3>

                <p className="mt-6 max-w-prose leading-relaxed text-rebar-ink-soft">
                  {text.blurb}
                </p>

                <dl className="mt-10 border-t border-rebar-line">
                  <Spec label={t('spec.bath', { defaultValue: 'Bath' })} value={text.bath} />
                  <Spec
                    label={t('spec.temp', { defaultValue: 'Serve temp' })}
                    value={t('spec.tempValue', { defaultValue: '{{c}} °C', c: course.tempC })}
                  />
                  <Spec
                    label={t('spec.pairing', { defaultValue: 'Pairing' })}
                    value={text.pairing}
                  />
                  <Spec
                    label={t('spec.allergens', { defaultValue: 'Allergens' })}
                    value={text.allergens}
                  />
                </dl>
              </motion.article>
            </AnimatePresence>
          </Reveal>
        </div>

        {/* ── The carte ──────────────────────────────────────────────────── */}
        <div className="mt-24 sm:mt-32">
          <Reveal>
            <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.26em] text-rebar-ink-faint">
              {t('card.title', { defaultValue: 'The menu, as printed' })}
            </h3>
          </Reveal>
          <DrawnRule className="mt-5" />

          <ul className="mt-2">
            {COURSES.map((c, i) => {
              const row = courseText(c.id, t);
              const isSelected = i === selected;
              return (
                <Reveal as="li" key={c.id} delay={stagger(i)}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelected(i)}
                    className={cn(
                      'group relative grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-5 gap-y-1 border-b border-rebar-line py-5 text-left',
                      'sm:grid-cols-[3rem_minmax(0,1fr)_5rem_14rem] sm:gap-x-8',
                      'transition-colors duration-[var(--rebar-dur-quick)]',
                      isSelected ? 'text-rebar-ink' : 'text-rebar-ink-soft hover:text-rebar-ink',
                    )}
                  >
                    {/* The selected row is marked by a rule that grows from the
                        left margin — the page's own structural device, rather
                        than a tint or a pill. */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -left-4 top-1/2 hidden h-px -translate-y-1/2 origin-left bg-rebar-line-strong transition-transform duration-[var(--rebar-dur-quick)] sm:block',
                        isSelected ? 'w-3 scale-x-100' : 'w-3 scale-x-0',
                      )}
                    />
                    <span
                      className={cn(
                        'font-mono text-xs tabular-nums transition-colors duration-[var(--rebar-dur-quick)]',
                        isSelected ? 'text-rebar-ink' : 'text-rebar-ink-faint',
                      )}
                    >
                      {courseNo(c.no)}
                    </span>
                    <span className="font-display text-lg font-light tracking-[-0.02em] sm:text-xl">
                      {row.name}
                    </span>
                    <span className="col-start-2 font-mono text-xs tabular-nums text-rebar-ink-faint sm:col-start-3">
                      {t('spec.tempValue', { defaultValue: '{{c}} °C', c: c.tempC })}
                    </span>
                    <span className="col-start-2 text-sm text-rebar-ink-faint sm:col-start-4">
                      {row.pairing}
                    </span>
                  </button>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * One fact, label in the margin. A rule beneath, never a box around.
 */
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-4 border-b border-rebar-line py-3.5">
      <dt className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
        {label}
      </dt>
      <dd className="text-sm text-rebar-ink">{value}</dd>
    </div>
  );
}
