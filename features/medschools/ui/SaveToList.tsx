import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  deleteMedListItemApi,
  saveMedListItemApi,
  type MedListDto,
  type MedListProgramId,
  type MedProgramFilter,
} from '../medschools.contract';
import { ME_KEY, listsQuery } from '../medschools.queries';

/** The list a school is saved with: the program filter in force when it is REG or PHD, else either. */
export const listProgramOf = (p: MedProgramFilter | null | undefined): MedListProgramId =>
  p === 'REG' || p === 'PHD' ? p : 'ANY';

/** The items of `list` that hold the school (a school can sit in a list once per program). */
export const itemsHolding = (list: MedListDto, slug: string) => list.items.filter((i) => i.school.slug === slug);

/**
 * "Save to list": a bookmark button that opens a menu of the signed-in member's lists, a check on each that holds the
 * school. Renders nothing when signed out or while the session is unresolved. Nothing is optimistic: the menu shows
 * what the server answered. With no list yet there is one row, "My schools" (created by the first save), and always
 * "New list".
 */
export function SaveToList({
  school,
  program,
}: {
  school: { slug: string; name: string };
  program?: MedProgramFilter | null;
}) {
  const { t } = useTranslation('medschools');
  const { data: session } = useSession();
  const signedIn = !!session;
  const qc = useQueryClient();
  const prompt = usePrompt();
  const refusal = useRefusalText();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const lists = useQuery({ ...listsQuery(), enabled: signedIn });

  const done = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      setOpen(false);
      return qc.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (e) => toast.error(refusal(e)),
  });

  if (!signedIn) return null;
  const all = lists.data?.lists ?? [];
  const save = (listId?: string, newListName?: string) =>
    api(saveMedListItemApi, {
      body: {
        schoolSlug: school.slug,
        program: listProgramOf(program),
        ...(listId ? { listId } : {}),
        ...(newListName ? { newListName } : {}),
      },
    });
  const toggle = (list: MedListDto) => {
    const held = itemsHolding(list, school.slug);
    done.mutate(async () => {
      if (held.length === 0) return save(list.id);
      for (const item of held) await api(deleteMedListItemApi, { params: { id: list.id, itemId: item.id } });
    });
  };
  const newList = async () => {
    setOpen(false);
    const name = await prompt({
      title: t('save-new-list-title', { defaultValue: 'New list' }),
      label: t('save-new-list-label', { defaultValue: 'List name' }),
      confirmLabel: t('save-new-list-confirm', { defaultValue: 'Create list' }),
      validate: (v) =>
        v.trim().length === 0 ? t('save-new-list-empty', { defaultValue: 'Give the list a name.' }) : null,
    });
    if (name) done.mutate(() => save(undefined, name.trim()));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="medapp-round"
        aria-label={t('save-trigger', { defaultValue: 'Save {{name}} to a list', name: school.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bookmark aria-hidden size={18} />
      </button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={t('save-menu-label', { defaultValue: 'Save to list' })}
        className="w-56"
      >
        {all.length === 0 ? (
          <MenuItem icon={Bookmark} onSelect={() => done.mutate(() => save())}>
            {t('save-default-list', { defaultValue: 'My schools' })}
          </MenuItem>
        ) : (
          all.map((list) => (
            <MenuItem key={list.id} checked={itemsHolding(list, school.slug).length > 0} onSelect={() => toggle(list)}>
              {list.name}
            </MenuItem>
          ))
        )}
        <MenuSeparator />
        <MenuItem icon={Plus} onSelect={() => void newList()}>
          {t('save-new-list', { defaultValue: 'New list' })}
        </MenuItem>
      </AnchoredMenu>
    </>
  );
}
