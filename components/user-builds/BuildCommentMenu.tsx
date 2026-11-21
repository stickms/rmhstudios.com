import {
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  EyeOff,
  Eye,
  Flag,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import type { BuildComment } from '@/lib/user-builds-types';

/**
 * The menu on one build comment (s06-14). Which rows appear is decided by the server (`canEdit`, `canDelete`,
 * `canHide`, `canReport` on the comment); this component only draws them. With no row to offer it draws nothing.
 */
export function BuildCommentMenu({
  comment,
  onEdit,
  onDelete,
  onHide,
  onReport,
}: {
  comment: BuildComment;
  onEdit: () => void;
  onDelete: () => void;
  onHide: (
    hidden: boolean,
  ) => void;
  onReport: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'build-comments',
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const triggerRef =
    useRef<HTMLButtonElement>(
      null,
    );
  const hidden =
    comment.state ===
      'hidden' ||
    comment.state ===
      'hidden-own';

  if (
    !comment.canEdit &&
    !comment.canDelete &&
    !comment.canHide &&
    !comment.canReport
  )
    return null;

  const pick =

      (
        fn: () => void,
      ) =>
      () => {
        setOpen(
          false,
        );
        fn();
      };

  return (
    <>
      <Button
        ref={
          triggerRef
        }
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-haspopup="menu"
        aria-expanded={
          open
        }
        aria-label={t(
          'menu-label',
          {
            defaultValue:
              'Actions for the comment by {{name}}',
            name:
              comment
                .user
                .name ??
              t(
                'someone',
                {
                  defaultValue:
                    'someone',
                },
              ),
          },
        )}
        onClick={() =>
          setOpen(
            (
              v,
            ) =>
              !v,
          )
        }
      >
        <MoreHorizontal
          aria-hidden
        />
      </Button>
      <AnchoredMenu
        open={
          open
        }
        onClose={() =>
          setOpen(
            false,
          )
        }
        anchorRef={
          triggerRef
        }
        label={t(
          'menu-panel',
          {
            defaultValue:
              'Comment actions',
          },
        )}
        className="w-48"
      >
        {comment.canEdit && (
          <MenuItem
            icon={
              Pencil
            }
            onSelect={pick(
              onEdit,
            )}
          >
            {t(
              'edit',
              {
                defaultValue:
                  'Edit',
              },
            )}
          </MenuItem>
        )}
        {comment.canHide && (
          <MenuItem
            icon={
              hidden
                ? Eye
                : EyeOff
            }
            onSelect={pick(
              () =>
                onHide(
                  !hidden,
                ),
            )}
          >
            {hidden
              ? t(
                  'unhide',
                  {
                    defaultValue:
                      'Unhide',
                  },
                )
              : t(
                  'hide',
                  {
                    defaultValue:
                      'Hide',
                  },
                )}
          </MenuItem>
        )}
        {comment.canReport && (
          <MenuItem
            icon={
              Flag
            }
            onSelect={pick(
              onReport,
            )}
          >
            {t(
              'report',
              {
                defaultValue:
                  'Report',
              },
            )}
          </MenuItem>
        )}
        {comment.canDelete && (
          <MenuItem
            icon={
              Trash2
            }
            tone="danger"
            onSelect={pick(
              onDelete,
            )}
          >
            {t(
              'delete',
              {
                defaultValue:
                  'Delete',
              },
            )}
          </MenuItem>
        )}
      </AnchoredMenu>
    </>
  );
}
