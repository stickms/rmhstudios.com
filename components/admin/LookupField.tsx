import {
  useState,
  type FormEvent,
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { MAX_LOOKUP_LENGTH } from '@/lib/admin/lookup';

/**
 * The one lookup box: paste an id, a handle, an e-mail address or a link, press Enter. It only
 * navigates to `/admin/lookup?q=`, so the address carries the query and a result can be shared
 * between admins. Used on the admin hub and on the lookup page.
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
      const q =
        value.trim();
      if (
        q
      )
        void navigate(
          {
            to: '/admin/lookup',
            search:
              {
                q,
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
          MAX_LOOKUP_LENGTH
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
