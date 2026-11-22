import {
  useState,
  type FormEvent,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import {
  MAX_BATCH_ITEMS,
  MAX_LOOKUP_LENGTH,
  classifyLookup,
  splitLookupInput,
} from '@/lib/admin/lookup';

/**
 * The one lookup box: paste an id, a handle, an e-mail address or a link, press Enter. It only
 * navigates to `/admin/lookup?q=` for one handle, id or link, so that result can be shared
 * between admins; an e-mail address or a pasted list travels in router state, never the address. Used on the admin hub and on the lookup page.
 */
export function LookupField({
  initial = '',
}: {
  initial?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin-lookup',
    );
  const navigate =
    useNavigate();
  const [
    value,
    setValue,
  ] =
    useState(
      initial,
    );
  const label =
    t(
      'field-label',
      {
        defaultValue:
          'Id, handle, e-mail address or link',
      },
    );

  const submit =
    (
      e: FormEvent,
    ) => {
      e.preventDefault();
      const items =
        splitLookupInput(
          value,
        );
      const only =
        items[0];
      if (
        items.length ===
          1 &&
        only !==
          undefined &&
        classifyLookup(
          only,
        ).type !==
          'email'
      )
        void navigate(
          {
            to: '/admin/lookup',
            search:
              {
                q: only,
              },
          },
        );
      // An e-mail address or a pasted list goes in router state, never in the address.
      else if (
        items.length >
        0
      )
        void navigate(
          {
            to: '/admin/lookup',
            search:
              {},
            state:
              {
                lookupItems:
                  items,
              },
          },
        );
    };

  return (
    <form
      role="search"
      onSubmit={
        submit
      }
      className="flex items-center gap-2"
    >
      <SearchField
        value={
          value
        }
        onValueChange={
          setValue
        }
        placeholder={
          label
        }
        aria-label={
          label
        }
        maxLength={
          MAX_LOOKUP_LENGTH *
          MAX_BATCH_ITEMS
        }
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={
          false
        }
        containerClassName="flex-1"
      />
      <Button
        type="submit"
        disabled={
          value.trim() ===
          ''
        }
      >
        {t(
          'field-submit',
          {
            defaultValue:
              'Look up',
          },
        )}
      </Button>
    </form>
  );
}
