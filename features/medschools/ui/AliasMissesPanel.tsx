import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  ignoreAliasMissApi,
  listAliasMissesApi,
  mapAliasMissApi,
  type AliasMissDto,
  type SchoolOptionDto,
} from '../medschools.contract';

/**
 * /admin/medschools: source names the scrapers could not match to a school. An admin maps each
 * one to a school (it becomes an alias) or ignores it. The /admin layout gates admins.
 */
export function AliasMissesPanel() {
  const { t } = useTranslation('medschools');
  const query = useQuery(apiQuery(listAliasMissesApi));
  const arrival = useArrival(!!query.data);

  return (
    <PageLayout
      title={t('title', {
        defaultValue: 'Med Schools aliases',
      })}
      description={t('description', {
        defaultValue: 'Names a source reported that match no school yet. Map each to a school, or ignore it.',
      })}
      wide
      backTo="/admin"
      backLabel={t('back', {
        defaultValue: 'Back to admin',
      })}
    >
      <AdminBody width="narrow">
        {query.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : query.isError ? (
          <EmptyState
            title={t('load-failed', {
              defaultValue: 'Could not load the alias misses',
            })}
            action={
              <Button onClick={() => void query.refetch()}>
                {t('retry', {
                  defaultValue: 'Try again',
                })}
              </Button>
            }
          />
        ) : query.data.misses.length === 0 ? (
          <EmptyState
            title={t('empty', {
              defaultValue: 'Nothing to map',
            })}
            description={t('empty-hint', {
              defaultValue: 'Every source name has a school or has been ignored.',
            })}
          />
        ) : (
          <ul className={cn('border-t border-site-border', arrival)}>
            {query.data.misses.map((miss) => (
              <MissRow key={miss.id} miss={miss} schools={query.data.schools} />
            ))}
          </ul>
        )}
      </AdminBody>
    </PageLayout>
  );
}

function MissRow({ miss, schools }: { miss: AliasMissDto; schools: SchoolOptionDto[] }) {
  const { t, i18n } = useTranslation('medschools');
  const queryClient = useQueryClient();
  const [schoolId, setSchoolId] = useState('');

  const conflictMessage = (e: unknown): string => {
    switch (errorField<string>(e, 'code')) {
      case 'CONFLICT_RETRY':
        return t('conflict-retry', {
          defaultValue: 'Another change landed first. Try again.',
        });
      case 'ALREADY_MAPPED':
        return t('already-mapped', {
          defaultValue: 'This name is already mapped to a school.',
        });
      case 'KEY_MAPPED_ELSEWHERE':
        return t('key-mapped-elsewhere', {
          defaultValue: 'This name already belongs to another school.',
        });
      case 'SCHOOL_INACTIVE':
        return t('school-inactive', {
          defaultValue: 'That school is inactive and cannot be mapped to.',
        });
      case 'SCHOOL_ALREADY_HAS_KEY':
        return t('school-has-key', {
          defaultValue: 'That school already has a key from this source.',
        });
      default:
        return (
          serverError(e) ??
          t('action-failed', {
            defaultValue: 'Could not save the change',
          })
        );
    }
  };

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [listAliasMissesApi.path],
    });

  const map = useMutation({
    mutationFn: () =>
      api(mapAliasMissApi, {
        body: {
          missId: miss.id,
          schoolId,
        },
      }),
    onSuccess: () => {
      toast.success(
        t('mapped', {
          defaultValue: 'Mapped',
        }),
      );
      void refresh();
    },
    onError: (e) => {
      toast.error(conflictMessage(e));
      // A stale row (already mapped or gone) is fixed by reloading the list.
      void refresh();
    },
  });

  const ignore = useMutation({
    mutationFn: () =>
      api(ignoreAliasMissApi, {
        body: {
          missId: miss.id,
        },
      }),
    onSuccess: () => {
      toast.success(
        t('ignored', {
          defaultValue: 'Ignored',
        }),
      );
      void refresh();
    },
    onError: (e) => {
      toast.error(conflictMessage(e));
      void refresh();
    },
  });

  const busy = map.isPending || ignore.isPending;

  return (
    <li className="flex min-w-0 flex-col gap-3 border-b border-site-border py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="t-meta">{miss.source}</p>
        <p className="t-body break-words text-site-text">{miss.sourceKey}</p>
        <p className="t-meta">
          {t('seen', {
            defaultValue_one: 'Seen {{count}} time',
            defaultValue_other: 'Seen {{count}} times',
            count: miss.seenCount,
          })}
          {' · '}
          <RelativeTime date={miss.lastSeenAt} format={(at, now) => formatRelativeTime(at, i18n.language, now)} />
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:w-64">
        <Select
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value)}
          aria-label={t('school-for', {
            defaultValue: 'School for {{name}}',
            name: miss.sourceKey,
          })}
          containerClassName="w-full"
        >
          <option value="">
            {t('pick-school', {
              defaultValue: 'Choose a school',
            })}
          </option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {' ('}
              {s.state}
              {')'}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button
            size="sm"
            aria-label={t('map-key', {
              defaultValue: 'Map {{name}}',
              name: miss.sourceKey,
            })}
            disabled={!schoolId || busy}
            loading={map.isPending}
            onClick={() => map.mutate()}
          >
            {t('map', {
              defaultValue: 'Map',
            })}
          </Button>
          <Button
            size="sm"
            aria-label={t('ignore-key', {
              defaultValue: 'Ignore {{name}}',
              name: miss.sourceKey,
            })}
            disabled={busy}
            loading={ignore.isPending}
            onClick={() => ignore.mutate()}
          >
            {t('ignore', {
              defaultValue: 'Ignore',
            })}
          </Button>
        </div>
      </div>
    </li>
  );
}
