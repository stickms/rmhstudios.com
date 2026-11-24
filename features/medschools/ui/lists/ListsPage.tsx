import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedButton } from '../controls/MedButton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { DEFAULT_VIEW_PREFS } from '../../engine/prefs';
import { LIMITS } from '../../engine/tracker';
import {
  addMedListToTrackerApi,
  createMedListApi,
  deleteMedListApi,
  deleteMedListItemApi,
  patchMedListApi,
  patchMedListItemApi,
  putMedListItemOrderApi,
  putMedListOrderApi,
  putMedPrefsApi,
  type MedListDto,
} from '../../medschools.contract';
import { ME_KEY, listsQuery, prefsQuery } from '../../medschools.queries';
import { MedEmpty } from '../MedEmpty';
import { MedSignedOut } from '../MedSignedOut';
import { PageHead } from '../shell/PageHead';
import { SkeletonSwap } from '../skeletons';
import { ListSection } from './ListSection';
import { PrefsSection, type PrefsDraft } from './PrefsSection';

/** The lists in the order the viewer is dragging them, until the server has answered. */
const inOrder = (lists: MedListDto[], ids: string[] | null): MedListDto[] =>
  ids ? ids.flatMap((id) => lists.filter((l) => l.id === id)) : lists;

/**
 * /rmh-medschool/lists: the member's saved lists and, below them, their preferences. Signed out: the sign-in prompt and
 * no request (a 401 after load turns into the same prompt). Nothing is optimistic except a reorder, which shows the
 * dragged order until the server answers; a stale order (409) refetches and says so once.
 */
export function ListsPage() {
  const { t } = useTranslation('medschools');
  const { data: session, isPending } = useSession();
  const signedIn = !!session;
  const qc = useQueryClient();
  const refusal = useRefusalText();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const lists = useQuery({ ...listsQuery(), enabled: signedIn });
  const prefs = useQuery({ ...prefsQuery(), enabled: signedIn });
  const [order, setOrder] = useState<string[] | null>(null);
  const [stale, setStale] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [trackerNote, setTrackerNote] = useState<string | null>(null);

  const head = <PageHead title={t('lists-title', { defaultValue: 'My lists' })} />;
  const expired = lists.error instanceof HttpError && lists.error.status === 401;

  if (!signedIn && isPending) {
    return (
      <>
        {head}
        <SkeletonSwap ready={false}>{null}</SkeletonSwap>
      </>
    );
  }
  if (!signedIn || expired) {
    return (
      <>
        {head}
        <MedSignedOut
          title={t('lists-signed-out-title', { defaultValue: 'Sign in to keep lists' })}
          description={t('lists-signed-out-body', {
            defaultValue: 'Your lists and preferences are private to your account.',
          })}
          callbackURL="/rmh-medschool/lists"
        />
      </>
    );
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ME_KEY });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.error(refusal(e));
    }
  };

  const all = inOrder(lists.data?.lists ?? [], order);

  const reorderLists = async (next: MedListDto[]) => {
    setOrder(next.map((l) => l.id));
    try {
      await api(putMedListOrderApi, { body: { ids: next.map((l) => l.id) } });
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) setStale(true);
      else toast.error(refusal(e));
    } finally {
      await refresh();
      setOrder(null);
    }
  };
  const reorderItems = (list: MedListDto, ids: string[]) =>
    run(async () => {
      try {
        await api(putMedListItemOrderApi, { params: { id: list.id }, body: { ids } });
      } catch (e) {
        if (e instanceof HttpError && e.status === 409) setStale(true);
        else throw e;
      }
    });

  const newList = async () => {
    const name = await prompt({
      title: t('lists-new-title', { defaultValue: 'New list' }),
      label: t('lists-new-label', { defaultValue: 'List name' }),
      confirmLabel: t('lists-new-confirm', { defaultValue: 'Create list' }),
      validate: (v) =>
        v.trim().length === 0 ? t('lists-name-empty', { defaultValue: 'Give the list a name.' }) : null,
    });
    if (name) await run(() => api(createMedListApi, { body: { name: name.trim() } }));
  };
  const rename = async (list: MedListDto) => {
    const name = await prompt({
      title: t('lists-rename-title', { defaultValue: 'Rename list' }),
      label: t('lists-new-label', { defaultValue: 'List name' }),
      initialValue: list.name,
      confirmLabel: t('lists-rename-confirm', { defaultValue: 'Rename' }),
      validate: (v) =>
        v.trim().length === 0 ? t('lists-name-empty', { defaultValue: 'Give the list a name.' }) : null,
    });
    if (name && name.trim() !== list.name) {
      await run(() => api(patchMedListApi, { params: { id: list.id }, body: { name: name.trim() } }));
    }
  };
  const remove = async (list: MedListDto) => {
    const ok = await confirm({
      title: t('lists-delete-title', { defaultValue: 'Delete {{name}}?', name: list.name }),
      description: t('lists-delete-body', {
        defaultValue: 'The list and its notes are removed. Your tracker is not changed.',
      }),
      confirmLabel: t('lists-delete', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (ok) await run(() => api(deleteMedListApi, { params: { id: list.id } }));
  };
  const addToTracker = async (list: MedListDto) => {
    try {
      const r = await api(addMedListToTrackerApi, { params: { id: list.id }, body: {} });
      setTrackerNote(
        t('lists-added', {
          defaultValue: '{{added}} added to your tracker, {{skipped}} already there.',
          added: r.added,
          skipped: r.skipped,
        }),
      );
      await refresh();
    } catch (e) {
      toast.error(refusal(e));
    }
  };
  const savePrefs = async (draft: PrefsDraft) => {
    const current = prefs.data ?? DEFAULT_VIEW_PREFS;
    setSavingPrefs(true);
    try {
      await api(putMedPrefsApi, {
        body: {
          programs: draft.programs,
          homeState: draft.homeState ?? current.homeState ?? null,
          chartCategories: draft.chartCategories,
        },
      });
      await refresh();
    } catch (e) {
      toast.error(refusal(e));
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <>
      {head}
      <div className="mb-4">
        <MedButton variant="primary" disabled={all.length >= LIMITS.lists} onClick={() => void newList()}>
          {t('lists-new', { defaultValue: 'New list' })}
        </MedButton>
      </div>
      <SkeletonSwap ready={!!lists.data}>
        {stale ? (
          <p className="medapp-meta mb-3" role="status">
            {t('lists-stale', { defaultValue: 'Your lists changed in another tab. Showing the current order.' })}
          </p>
        ) : null}
        {trackerNote ? (
          <p className="medapp-meta mb-3" role="status">
            {trackerNote}
          </p>
        ) : null}
        {all.length === 0 ? (
          <MedEmpty
            title={t('lists-none-title', { defaultValue: 'No lists yet' })}
            description={t('lists-none-body', {
              defaultValue: 'Use the bookmark on a school to save it, or create a list first.',
            })}
          />
        ) : (
          <div className="medapp-tab">
            {all.map((list, i) => (
              <ListSection
                key={list.id}
                list={list}
                onMove={(by) => {
                  const ids = all.map((l) => l.id);
                  const to = i + by;
                  if (to < 0 || to >= ids.length) return;
                  [ids[i], ids[to]] = [ids[to]!, ids[i]!];
                  void reorderLists(ids.flatMap((id) => all.filter((l) => l.id === id)));
                }}
                canMoveUp={i > 0}
                canMoveDown={i < all.length - 1}
                onRename={() => void rename(list)}
                onDelete={() => void remove(list)}
                onAddToTracker={() => addToTracker(list)}
                onReorderItems={(ids) => void reorderItems(list, ids)}
                onSaveNote={(itemId, note) =>
                  run(() => api(patchMedListItemApi, { params: { id: list.id, itemId }, body: { note } }))
                }
                onRemoveItem={(itemId) => run(() => api(deleteMedListItemApi, { params: { id: list.id, itemId } }))}
              />
            ))}
          </div>
        )}
      </SkeletonSwap>

      <div className="mt-10">
        <PrefsSection prefs={prefs.data ?? DEFAULT_VIEW_PREFS} busy={savingPrefs} onChange={(d) => void savePrefs(d)} />
      </div>
    </>
  );
}
