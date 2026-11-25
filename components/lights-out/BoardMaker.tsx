/**
 * Make a Lights Out board: pick a shape, set the lights by hand or scramble, watch "Solvable in N moves" (the exact
 * solver, the same one the server runs at publish), title it and publish. A board that cannot be solved, is already
 * dark, or is solvable in fewer than three moves cannot be published.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { LightsGrid } from '@/components/lights-out/LightsGrid';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { createLightsOutBoardApi } from '@/lib/lights-out/boards.contract';
import {
  MAX_RECT_SIDE,
  MAX_TITLE_LENGTH,
  MIN_BOARD_MOVES,
  MIN_RECT_SIDE,
  checkPublish,
  dailyShapeChoices,
  encodeCells,
  isAllowedShape,
  scrambleBoard,
  shapeName,
  toStoredShape,
  type StoredShape,
} from '@/lib/lights-out/boards';
import { createEmptyGrid, type Grid } from '@/lib/lights-out/lights-out';
import type { GridShape } from '@/lib/lights-out/shapes';

const SIDES = Array.from({ length: MAX_RECT_SIDE - MIN_RECT_SIDE + 1 }, (_, i) => MIN_RECT_SIDE + i);
const DAILY_CHOICES = dailyShapeChoices();

/** The picker's value for a stored shape, and back. `rect` stands for the rectangle with its two side pickers. */
function choiceValue(s: StoredShape): string {
  if (s.type === 'rect') return 'rect';
  return s.type === 'triangle' ? `triangle:${s.size}` : `custom:${s.label}`;
}

function shapeOf(choice: string, rows: number, cols: number): GridShape {
  let stored: StoredShape = { type: 'rect', rows, cols };
  const found = DAILY_CHOICES.find((s) => choiceValue(s) === choice);
  if (found) stored = found;
  return isAllowedShape(stored) ?? { type: 'rect', rows: 5, cols: 5 };
}

export function BoardMaker() {
  const { t } = useTranslation('lights-out-maker');
  const session = useSession();
  const navigate = useNavigate();
  const refusalText = useRefusalText();
  const [choice, setChoice] = useState('rect');
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const shape = useMemo(() => shapeOf(choice, rows, cols), [choice, rows, cols]);
  const [grid, setGrid] = useState<Grid>(() => createEmptyGrid({ type: 'rect', rows: 5, cols: 5 }));
  const [title, setTitle] = useState('');
  const [publishing, setPublishing] = useState(false);

  const check = useMemo(() => checkPublish(grid, shape), [grid, shape]);

  function changeShape(nextChoice: string, nextRows: number, nextCols: number) {
    setChoice(nextChoice);
    setRows(nextRows);
    setCols(nextCols);
    setGrid(createEmptyGrid(shapeOf(nextChoice, nextRows, nextCols)));
  }

  // Setting the starting lights: pressing a cell here flips that one light, not its neighbours.
  function flipLight(r: number, c: number) {
    setGrid((g) => g.map((row, ri) => (ri === r ? row.map((on, ci) => (ci === c ? !on : on)) : row)));
  }

  async function publish() {
    if (!check.ok || !title.trim() || publishing) return;
    setPublishing(true);
    try {
      const res = await api(createLightsOutBoardApi, {
        body: { title: title.trim(), shape: toStoredShape(shape), cells: encodeCells(grid, shape) },
      });
      toast.success(t('published', { defaultValue: 'Board published' }));
      void navigate({ to: '/lights-out/b/$id', params: { id: res.id } });
    } catch (e) {
      toast.error(refusalText(e));
      setPublishing(false);
    }
  }

  let status: string;
  if (check.ok) {
    status = t('solvable', {
      defaultValue_one: 'Solvable in {{count}} move',
      defaultValue: 'Solvable in {{count}} moves',
      count: check.optimalMoves,
    });
  } else if (check.reason === 'dark') {
    status = t('status-dark', { defaultValue: 'Every light is off. Turn some on.' });
  } else if (check.reason === 'unsolvable') {
    status = t('status-unsolvable', { defaultValue: 'This board cannot be solved. Change a light.' });
  } else {
    status = t('status-too-easy', {
      defaultValue: 'Solvable in fewer than {{min}} moves. Turn more lights on.',
      min: MIN_BOARD_MOVES,
    });
  }

  if (!session.data) {
    return (
      <PageLayout title={t('title', { defaultValue: 'Make a Lights Out board' })}>
        <SignedOutPrompt
          title={t('signed-out-title', { defaultValue: 'Sign in to make a board' })}
          description={t('signed-out-description', {
            defaultValue: 'Boards you make can be played by anyone with the link.',
          })}
          callbackURL="/lights-out/new"
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t('title', { defaultValue: 'Make a Lights Out board' })}
      description={t('description', {
        defaultValue: 'Set the lights, check it can be solved, and send it to friends.',
      })}
      backTo="/lights-out/boards"
      backLabel={t('back', { defaultValue: 'Boards' })}
    >
      <div className="flex flex-col gap-6 pb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lights-out-maker-shape">{t('shape-label', { defaultValue: 'Shape' })}</Label>
            <Select
              id="lights-out-maker-shape"
              value={choice}
              onChange={(e) => changeShape(e.target.value, rows, cols)}
            >
              <option value="rect">{t('shape-rect', { defaultValue: 'Rectangle' })}</option>
              {DAILY_CHOICES.map((s) => {
                const full = isAllowedShape(s);
                return (
                  <option key={choiceValue(s)} value={choiceValue(s)}>
                    {full ? shapeName(full) : choiceValue(s)}
                  </option>
                );
              })}
            </Select>
          </div>
          {choice === 'rect' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lights-out-maker-rows">{t('rows-label', { defaultValue: 'Rows' })}</Label>
                <Select
                  id="lights-out-maker-rows"
                  value={String(rows)}
                  onChange={(e) => changeShape('rect', Number(e.target.value), cols)}
                >
                  {SIDES.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lights-out-maker-cols">{t('cols-label', { defaultValue: 'Columns' })}</Label>
                <Select
                  id="lights-out-maker-cols"
                  value={String(cols)}
                  onChange={(e) => changeShape('rect', rows, Number(e.target.value))}
                >
                  {SIDES.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-sm rounded-site border border-site-border p-5">
          <LightsGrid grid={grid} shape={shape} onPress={flipLight} />
        </div>

        <p role="status" aria-live="polite" className="t-body">
          {status}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setGrid(scrambleBoard(shape))}>
            {t('scramble', { defaultValue: 'Scramble' })}
          </Button>
          <Button type="button" onClick={() => setGrid(createEmptyGrid(shape))}>
            {t('clear', { defaultValue: 'Clear' })}
          </Button>
        </div>

        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="lights-out-maker-title">{t('title-label', { defaultValue: 'Title' })}</Label>
          <Input
            id="lights-out-maker-title"
            dir="auto"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <Button
            type="button"
            variant="primary"
            onClick={() => void publish()}
            disabled={!check.ok || !title.trim() || publishing}
          >
            {t('publish', { defaultValue: 'Publish board' })}
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
