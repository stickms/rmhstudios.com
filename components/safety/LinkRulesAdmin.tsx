import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  addAdminLinkRuleApi,
  deleteAdminLinkRuleApi,
  listAdminLinkRulesApi,
} from '@/lib/admin/admin-ops.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface Rule {
  domain: string;
  kind:
    | 'DENY'
    | 'ALLOW';
  note:
    | string
    | null;
}

/** S6: the admin-editable list behind the /out link warning. */
export function LinkRulesAdmin() {
  const {
    t,
  } =
    useTranslation(
      'f-safety',
    );
  const [
    rules,
    setRules,
  ] =
    useState<
      | Rule[]
      | null
    >(
      null,
    );
  const [
    domain,
    setDomain,
  ] =
    useState(
      '',
    );
  const [
    kind,
    setKind,
  ] =
    useState<
      | 'DENY'
      | 'ALLOW'
    >(
      'DENY',
    );
  const [
    note,
    setNote,
  ] =
    useState(
      '',
    );
  const arrival =
    useArrival(
      rules !==
        null,
    );

  const load =
    useCallback(async () => {
      try {
        setRules(
          (
            await api(
              listAdminLinkRulesApi,
              {
                retries: 0,
              },
            )
          )
            .items,
        );
      } catch {
        setRules(
          [],
        );
      }
    }, []);
  useEffect(() => {
    void load();
  }, [
    load,
  ]);

  const add =
    async () => {
      try {
        await api(
          addAdminLinkRuleApi,
          {
            body: {
              domain,
              kind,
              note:
                note ||
                undefined,
            },
          },
        );
      } catch (e) {
        return toast.error(
          serverError(
            e,
          ) ||
            t(
              'rules-failed',
              {
                defaultValue:
                  "Couldn't save the rule",
              },
            ),
        );
      }
      setDomain(
        '',
      );
      setNote(
        '',
      );
      void load();
    };

  const remove =
    async (
      d: string,
    ) => {
      await api(
        deleteAdminLinkRuleApi,
        {
          query:
            {
              domain:
                d,
            },
        },
      ).catch(
        () =>
          undefined,
      );
      void load();
    };

  return (
    <div className="flex flex-col gap-4">
      <p className="t-body text-site-text-muted">
        {t(
          'rules-intro',
          {
            defaultValue:
              'Links to blocked domains, and to domains that only just started appearing, open a warning page first. Allowed domains skip the new-domain warning.',
          },
        )}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="min-w-48 flex-1"
          value={
            domain
          }
          onChange={(
            e,
          ) =>
            setDomain(
              e
                .target
                .value,
            )
          }
          placeholder={t(
            'rules-domain',
            {
              defaultValue:
                'example.com',
            },
          )}
          aria-label={t(
            'rules-domain-label',
            {
              defaultValue:
                'Domain',
            },
          )}
        />
        <Select
          containerClassName="inline-block w-auto"
          className="w-auto"
          value={
            kind
          }
          onChange={(
            e,
          ) =>
            setKind(
              e
                .target
                .value as
                | 'DENY'
                | 'ALLOW',
            )
          }
          aria-label={t(
            'rules-kind-label',
            {
              defaultValue:
                'Rule type',
            },
          )}
        >
          <option value="DENY">
            {t(
              'rules-deny',
              {
                defaultValue:
                  'Block',
              },
            )}
          </option>
          <option value="ALLOW">
            {t(
              'rules-allow',
              {
                defaultValue:
                  'Allow',
              },
            )}
          </option>
        </Select>
        <Input
          className="min-w-40 flex-1"
          value={
            note
          }
          onChange={(
            e,
          ) =>
            setNote(
              e
                .target
                .value,
            )
          }
          maxLength={
            200
          }
          placeholder={t(
            'rules-note',
            {
              defaultValue:
                'Note (optional)',
            },
          )}
          aria-label={t(
            'rules-note',
            {
              defaultValue:
                'Note (optional)',
            },
          )}
        />
        <Button
          variant="default"
          disabled={
            domain.trim()
              .length <
            3
          }
          onClick={
            add
          }
        >
          {t(
            'rules-add',
            {
              defaultValue:
                'Add rule',
            },
          )}
        </Button>
      </div>
      {!rules ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : rules.length ===
        0 ? (
        <p
          className={cn(
            't-body text-site-text-muted',
            arrival,
          )}
        >
          {t(
            'rules-empty',
            {
              defaultValue:
                'No rules yet.',
            },
          )}
        </p>
      ) : (
        <ul
          className={cn(
            'divide-y divide-site-border border-t border-site-border',
            arrival,
          )}
        >
          {rules.map(
            (
              r,
            ) => (
              <li
                key={
                  r.domain
                }
                className="flex items-center gap-3 py-3"
              >
                <Badge variant="default">
                  {r.kind ===
                  'DENY'
                    ? t(
                        'rules-deny',
                        {
                          defaultValue:
                            'Block',
                        },
                      )
                    : t(
                        'rules-allow',
                        {
                          defaultValue:
                            'Allow',
                        },
                      )}
                </Badge>
                <span className="min-w-0 flex-1 break-all font-mono t-body text-site-text">
                  {
                    r.domain
                  }
                </span>
                {r.note && (
                  <span className="hidden t-meta sm:inline">
                    {
                      r.note
                    }
                  </span>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    remove(
                      r.domain,
                    )
                  }
                  aria-label={t(
                    'rules-remove',
                    {
                      defaultValue:
                        'Remove rule',
                    },
                  )}
                >
                  <Trash2
                    aria-hidden
                  />
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
