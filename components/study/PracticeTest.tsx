import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/lib/toast';
import { useArrival } from '@/components/ui/arrive';
import { recordDeckTest } from '@/lib/study/tests.queries';
import {
  buildTest,
  gradeWritten,
  MAX_QUESTIONS,
  newSeed,
  scoreQuestion,
  scoreTest,
  type TestCard,
  type TestOptions,
  type TestQuestion,
  type TestResponse,
} from '@/lib/study/practice-test';
import { listDeckTestsApi } from '@/lib/study/tests.contract';
import { PracticeTestSetup } from '@/components/study/PracticeTestSetup';
import { PracticeTestResults, type SaveState } from '@/components/study/PracticeTestResults';
import { MultipleChoice } from '@/components/study/questions/MultipleChoice';
import { Written } from '@/components/study/questions/Written';
import { TrueFalse } from '@/components/study/questions/TrueFalse';
import { Matching } from '@/components/study/questions/Matching';

export interface PracticeTestDeck {
  deck: { id: string; title: string };
  cards: TestCard[];
  signedIn: boolean;
}

type SetupOptions = Pick<TestOptions, 'count' | 'kinds' | 'direction'>;
interface Run {
  options: TestOptions;
  seed: number;
  questions: TestQuestion[];
}
type Phase = { name: 'setup' } | { name: 'question' } | { name: 'results'; durationMs: number };

/** A draft is ready to check once the student has said something. */
function canCheck(draft: TestResponse | undefined): boolean {
  if (!draft) return false;
  if (draft.kind === 'written') return draft.text.trim() !== '';
  if (draft.kind === 'matching') return Object.keys(draft.pairs).length > 0;
  return true;
}

/**
 * A practice test on one deck: setup, one question per screen (Check, then Next), then results.
 * Questions are rebuilt from the seed, so "retake" gives the identical test. A test never changes
 * SM-2 scheduling; its result is stored separately for signed-in students.
 */
export function PracticeTest({ deckId, data }: { deckId: string; data: PracticeTestDeck | null }) {
  const { t, i18n } = useTranslation('study-tests');
  const locale = i18n.language;
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [run, setRun] = useState<Run | null>(null);
  const [setupOptions, setSetupOptions] = useState<SetupOptions | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(TestResponse | undefined)[]>([]);
  const [draft, setDraft] = useState<TestResponse | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('nothing');
  const progressRef = useRef<HTMLParagraphElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const arrival = useArrival(true);

  const cards = useMemo(() => data?.cards ?? [], [data]);

  // A new question takes focus on its progress line so a screen reader announces it; after Check the
  // primary button takes focus so Enter moves on.
  useEffect(() => {
    if (phase.name === 'question') progressRef.current?.focus();
  }, [phase.name, index]);
  useEffect(() => {
    if (checked) primaryRef.current?.focus();
  }, [checked]);

  if (!data) {
    return (
      <EmptyState
        title={t('deck-not-found', { defaultValue: 'Deck not found' })}
        action={
          <Link to="/study">
            <Button variant="default">{t('back-to-decks', { defaultValue: 'Back to decks' })}</Button>
          </Link>
        }
      />
    );
  }

  const back = (
    <Link to="/study/$deckId" params={{ deckId }} className="t-meta inline-flex items-center gap-1 hover:text-site-text">
      <ArrowLeft className="size-3.5" aria-hidden />
      {data.deck.title}
    </Link>
  );

  if (cards.length === 0) {
    return (
      <div className={arrival}>
        {back}
        <EmptyState
          title={t('empty-title', { defaultValue: 'This deck has no cards yet' })}
          description={t('empty-body', { defaultValue: 'Add cards to the deck, then come back to test yourself.' })}
        />
      </div>
    );
  }

  function begin(options: TestOptions, seed: number) {
    const questions = buildTest(cards, options, seed);
    if (questions.length === 0) {
      toast.error(t('build-failed', { defaultValue: 'Could not build a test from this deck' }));
      return;
    }
    setRun({ options, seed, questions });
    setIndex(0);
    setAnswers([]);
    setDraft(undefined);
    setChecked(false);
    setSaveState('nothing');
    setStartedAt(Date.now());
    setPhase({ name: 'question' });
  }

  async function finish(finalAnswers: (TestResponse | undefined)[]) {
    if (!run) return;
    const durationMs = Date.now() - startedAt;
    const score = scoreTest(run.questions, finalAnswers, locale);
    setAnswers(finalAnswers);
    setPhase({ name: 'results', durationMs });
    if (score.answered === 0) {
      setSaveState('nothing');
      return;
    }
    if (!data?.signedIn) {
      setSaveState('signed-out');
      return;
    }
    setSaveState('saving');
    try {
      await recordDeckTest(deckId, {
        total: score.total,
        correct: score.correct,
        kinds: [...new Set(run.questions.filter((_, i) => score.perQuestion[i]).map((q) => q.kind))],
        durationMs,
        missedCardIds: score.missedCardIds,
        seed: run.seed,
      });
      setSaveState('saved');
      void queryClient.invalidateQueries({ queryKey: [listDeckTestsApi.path] });
    } catch {
      setSaveState('failed');
    }
  }

  const header = (
    <div className="space-y-2">
      {back}
      <h1 className="t-title">{t('title', { defaultValue: 'Practice test' })}</h1>
    </div>
  );

  if (phase.name === 'setup' || !run) {
    return (
      <div className={`space-y-6 ${arrival ?? ''}`}>
        {header}
        {!data.signedIn && (
          <p className="t-meta">
            {t('signed-out-note', { defaultValue: 'You are not signed in, so your result will not be saved.' })}
          </p>
        )}
        <PracticeTestSetup
          cards={cards}
          initial={setupOptions}
          onStart={(options) => {
            setSetupOptions(options);
            begin(options, newSeed());
          }}
        />
      </div>
    );
  }

  if (phase.name === 'results') {
    const score = scoreTest(run.questions, answers, locale);
    return (
      <div className={`space-y-6 ${arrival ?? ''}`}>
        {header}
        <PracticeTestResults
          deckId={deckId}
          questions={run.questions}
          answers={answers}
          score={score}
          durationMs={phase.durationMs}
          saveState={saveState}
          locale={locale}
          onRetake={() => begin(run.options, run.seed)}
          onNewTest={() => setPhase({ name: 'setup' })}
          onTestMissed={() =>
            begin(
              {
                count: Math.min(MAX_QUESTIONS, score.missedCardIds.length),
                kinds: run.options.kinds,
                direction: run.options.direction,
                onlyCardIds: score.missedCardIds,
              },
              newSeed(),
            )
          }
        />
      </div>
    );
  }

  const question = run.questions[index] as TestQuestion;
  const isLast = index + 1 >= run.questions.length;

  function check() {
    if (!canCheck(draft)) return;
    const next = answers.slice();
    next[index] = draft;
    setAnswers(next);
    setChecked(true);
  }
  function advance() {
    if (isLast) {
      void finish(answers);
      return;
    }
    setIndex(index + 1);
    setDraft(undefined);
    setChecked(false);
  }
  function accept() {
    if (draft?.kind !== 'written') return;
    const accepted: TestResponse = { ...draft, accepted: true };
    setDraft(accepted);
    const next = answers.slice();
    next[index] = accepted;
    setAnswers(next);
    // The accept button disappears; keep focus on the way forward.
    primaryRef.current?.focus();
  }

  const written = draft?.kind === 'written' ? draft : undefined;
  const feedback = (() => {
    if (!checked || !draft) return '';
    if (question.kind === 'written' && draft.kind === 'written') {
      return {
        correct: t('written-correct', { defaultValue: 'Correct' }),
        almost: t('written-almost-live', { defaultValue: 'Almost' }),
        wrong: t('written-wrong-live', { defaultValue: 'Not quite' }),
      }[gradeWritten(question.answer, draft.text, locale)];
    }
    if (question.kind === 'matching') return t('checked', { defaultValue: 'Answer checked' });
    return scoreQuestion(question, draft, locale).points === 1
      ? t('written-correct', { defaultValue: 'Correct' })
      : t('written-wrong-live', { defaultValue: 'Not quite' });
  })();

  return (
    <form
      className={`space-y-6 ${arrival ?? ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (checked) advance();
        else check();
      }}
    >
      {header}
      <p ref={progressRef} tabIndex={-1} className="t-meta">
        {t('progress', {
          defaultValue: 'Question {{current}} of {{total}}',
          current: index + 1,
          total: run.questions.length,
        })}
      </p>

      {question.kind === 'multiple-choice' && (
        <MultipleChoice
          key={index}
          question={question}
          choice={draft?.kind === 'multiple-choice' ? draft.choice : undefined}
          onChoose={(choice) => setDraft({ kind: 'multiple-choice', choice })}
          locked={checked}
        />
      )}
      {question.kind === 'written' && (
        <Written
          key={index}
          question={question}
          text={written?.text ?? ''}
          accepted={written?.accepted === true}
          onText={(text) => setDraft({ kind: 'written', text })}
          onAccept={accept}
          locked={checked}
          locale={locale}
        />
      )}
      {question.kind === 'true-false' && (
        <TrueFalse
          key={index}
          question={question}
          answer={draft?.kind === 'true-false' ? draft.answer : undefined}
          onAnswer={(answer) => setDraft({ kind: 'true-false', answer })}
          locked={checked}
        />
      )}
      {question.kind === 'matching' && (
        <Matching
          key={index}
          question={question}
          pairs={draft?.kind === 'matching' ? draft.pairs : {}}
          onPairs={(pairs) => setDraft({ kind: 'matching', pairs })}
          locked={checked}
        />
      )}

      <p className="sr-only" aria-live="polite">
        {feedback}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button ref={primaryRef} type="submit" variant="primary" disabled={!checked && !canCheck(draft)}>
          {checked
            ? isLast
              ? t('finish', { defaultValue: 'See results' })
              : t('next', { defaultValue: 'Next' })
            : t('check', { defaultValue: 'Check' })}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void finish(answers)}>
          {t('end-test', { defaultValue: 'End test' })}
        </Button>
      </div>
    </form>
  );
}
