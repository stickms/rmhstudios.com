import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Handshake, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { REFERRAL_MAX_CAPACITY } from '@/lib/rmhladder/community';
import { apiJson } from '@/lib/rmhladder/community-client';

interface Person {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}
interface BoardData {
  offers: Array<{
    id: string;
    companyName: string;
    roles: string;
    note: string | null;
    spotsLeft: number;
    referrer: Person;
    myRequest: string | null;
  }>;
  mine: Array<{
    id: string;
    companyName: string;
    roles: string;
    capacity: number;
    status: string;
    requests: Array<{ id: string; pitch: string; status: string; applicant: Person }>;
  }>;
  sent: Array<{ id: string; status: string; companyName: string; roles: string; referrer: Person }>;
}

const KEY = ['ladder-referrals'];

function PersonLink({ p }: { p: Person }) {
  return (
    <Link
      to="/u/$userid"
      params={{ userid: p.username ?? p.id }}
      className="font-medium text-site-accent hover:underline"
    >
      {p.name ?? p.username ?? 'Member'}
    </Link>
  );
}

/**
 * Referral board (F6). Members offer a limited number of referrals at their
 * company; applicants send one short pitch each; the offerer accepts or passes.
 * Company names are attested by the member — the board does not verify employment.
 */
export function ReferralBoard() {
  const { t } = useTranslation('f-ladder-homes');
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const [askingId, setAskingId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: [...KEY, q],
    queryFn: () =>
      apiJson<BoardData>(
        `/api/rmhladder/referrals${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
      ),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const act = useMutation({
    mutationFn: (v: { id: string; action: 'accept' | 'pass' | 'withdraw' }) =>
      apiJson(`/api/rmhladder/referral-requests/${v.id}`, {
        method: 'PATCH',
        body: { action: v.action },
      }),
    onSuccess: () => void refresh(),
    onError: (e: Error) => toast.error(e.message),
  });
  const close = useMutation({
    mutationFn: (id: string) => apiJson(`/api/rmhladder/referrals/${id}`, { method: 'DELETE' }),
    onSuccess: () => void refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const statusLabel: Record<string, string> = {
    pending: t('rb-status-pending', { defaultValue: 'Waiting' }),
    accepted: t('rb-status-accepted', { defaultValue: 'Accepted' }),
    passed: t('rb-status-passed', { defaultValue: 'Passed' }),
    withdrawn: t('rb-status-withdrawn', { defaultValue: 'Withdrawn' }),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-site-text">
          <Handshake className="size-5" aria-hidden />
          {t('rb-title', { defaultValue: 'Referral board' })}
        </h1>
        <p className="text-sm text-site-text-muted">
          {t('rb-intro', {
            defaultValue:
              'Members offer a few referrals at their company. Ask with a short pitch; the member accepts or passes. Employers are self-reported and not verified.',
          })}
        </p>
        <Button
          type="button"
          variant={offerOpen ? 'outline' : 'accent'}
          className="min-h-11"
          aria-expanded={offerOpen}
          onClick={() => setOfferOpen((v) => !v)}
        >
          {t('rb-offer-cta', { defaultValue: 'Offer a referral' })}
        </Button>
        {offerOpen && (
          <OfferForm
            onDone={() => {
              setOfferOpen(false);
              void refresh();
            }}
          />
        )}
      </header>

      {isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          {data.mine.length > 0 && (
            <section aria-labelledby="rb-mine" className="space-y-3">
              <h2 id="rb-mine" className="text-sm font-semibold text-site-text">
                {t('rb-mine', { defaultValue: 'Your offers' })}
              </h2>
              {data.mine.map((o) => (
                <Card key={o.id} className="glass-fill gap-3 py-4">
                  <CardHeader className="flex-row items-center justify-between gap-2 px-5">
                    <CardTitle className="text-base">
                      {o.companyName}{' '}
                      <span className="font-normal text-site-text-muted">· {o.roles}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={o.status === 'open' ? 'success' : 'outline'} size="sm">
                        {o.status === 'open'
                          ? t('rb-open', { defaultValue: 'Open' })
                          : t('rb-closed', { defaultValue: 'Closed' })}
                      </Badge>
                      {o.status === 'open' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          disabled={close.isPending}
                          onClick={() => close.mutate(o.id)}
                        >
                          {t('rb-close', { defaultValue: 'Close offer' })}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 px-5">
                    {o.requests.length === 0 ? (
                      <p className="text-sm text-site-text-muted">
                        {t('rb-no-requests', { defaultValue: 'No requests yet.' })}
                      </p>
                    ) : (
                      o.requests.map((r) => (
                        <div key={r.id} className="glass-inset rounded-site-sm p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <PersonLink p={r.applicant} />
                            <Badge variant="outline" size="sm">
                              {statusLabel[r.status] ?? r.status}
                            </Badge>
                            {r.status === 'pending' && (
                              <span className="ml-auto flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="accent"
                                  className="min-h-11"
                                  disabled={act.isPending}
                                  onClick={() => act.mutate({ id: r.id, action: 'accept' })}
                                >
                                  <Check aria-hidden />
                                  {t('rb-accept', { defaultValue: 'Accept' })}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="min-h-11"
                                  disabled={act.isPending}
                                  onClick={() => act.mutate({ id: r.id, action: 'pass' })}
                                >
                                  <X aria-hidden />
                                  {t('rb-pass', { defaultValue: 'Pass' })}
                                </Button>
                              </span>
                            )}
                          </div>
                          <p className="mt-2 whitespace-pre-line text-site-text-muted">{r.pitch}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          {data.sent.length > 0 && (
            <section aria-labelledby="rb-sent" className="space-y-3">
              <h2 id="rb-sent" className="text-sm font-semibold text-site-text">
                {t('rb-sent', { defaultValue: 'Your requests' })}
              </h2>
              <ul className="space-y-2">
                {data.sent.map((r) => (
                  <li
                    key={r.id}
                    className="glass-fill flex flex-wrap items-center gap-2 rounded-site-sm p-3 text-sm"
                  >
                    <span className="font-medium text-site-text">{r.companyName}</span>
                    <span className="text-site-text-muted">{r.roles}</span>
                    <Badge variant={r.status === 'accepted' ? 'success' : 'outline'} size="sm">
                      {statusLabel[r.status] ?? r.status}
                    </Badge>
                    {r.status === 'accepted' && (
                      <span className="text-site-text-muted">
                        {t('rb-accepted-by', { defaultValue: 'Reach out to' })}{' '}
                        <PersonLink p={r.referrer} />
                      </span>
                    )}
                    {r.status === 'pending' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto min-h-11"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: r.id, action: 'withdraw' })}
                      >
                        {t('rb-withdraw', { defaultValue: 'Withdraw' })}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="rb-board" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="rb-board" className="text-sm font-semibold text-site-text">
                {t('rb-board', { defaultValue: 'Open offers' })}
              </h2>
              <Input
                type="search"
                className="max-w-xs"
                value={q}
                maxLength={120}
                placeholder={t('rb-search', { defaultValue: 'Filter by company…' })}
                aria-label={t('rb-search-label', { defaultValue: 'Filter offers by company' })}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {data.offers.length === 0 ? (
              <EmptyState
                icon={Handshake}
                title={t('rb-empty-title', { defaultValue: 'No open offers' })}
                description={t('rb-empty-body', {
                  defaultValue: 'Be the first: offer a referral at your company.',
                })}
              />
            ) : (
              <ul className="space-y-3">
                {data.offers.map((o) => (
                  <li key={o.id} className="glass-fill rounded-site p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-site-text">{o.companyName}</span>
                      <span className="text-sm text-site-text-muted">{o.roles}</span>
                      <Badge variant="outline" size="sm">
                        {t('rb-spots', {
                          defaultValue: '{{count}} spots left',
                          count: o.spotsLeft,
                        })}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-site-text-muted">
                      {t('rb-by', { defaultValue: 'Offered by' })} <PersonLink p={o.referrer} />
                    </p>
                    {o.note && (
                      <p className="mt-2 whitespace-pre-line text-sm text-site-text-muted">
                        {o.note}
                      </p>
                    )}
                    <div className="mt-3">
                      {o.myRequest ? (
                        <Badge variant="outline">
                          {t('rb-asked', {
                            defaultValue: 'You asked — {{status}}',
                            status: statusLabel[o.myRequest] ?? o.myRequest,
                          })}
                        </Badge>
                      ) : o.spotsLeft === 0 ? null : askingId === o.id ? (
                        <RequestForm
                          offerId={o.id}
                          onDone={() => {
                            setAskingId(null);
                            void refresh();
                          }}
                        />
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => setAskingId(o.id)}
                        >
                          {t('rb-ask', { defaultValue: 'Ask for a referral' })}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function OfferForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('f-ladder-homes');
  const [companyName, setCompanyName] = useState('');
  const [roles, setRoles] = useState('');
  const [note, setNote] = useState('');
  const [capacity, setCapacity] = useState(3);
  const create = useMutation({
    mutationFn: () =>
      apiJson('/api/rmhladder/referrals', {
        method: 'POST',
        body: { companyName, roles, note: note || undefined, capacity },
      }),
    onSuccess: () => {
      toast.success(t('rb-offer-posted', { defaultValue: 'Offer posted.' }));
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="glass-pane mt-3 space-y-3 rounded-site p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">
            {t('rb-company', { defaultValue: 'Company you work at' })}
          </span>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">
            {t('rb-roles', { defaultValue: 'Roles you can refer for' })}
          </span>
          <Input
            value={roles}
            onChange={(e) => setRoles(e.target.value)}
            maxLength={200}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">
            {t('rb-capacity', { defaultValue: 'How many referrals can you give?' })}
          </span>
          <Select value={String(capacity)} onChange={(e) => setCapacity(Number(e.target.value))}>
            {Array.from({ length: REFERRAL_MAX_CAPACITY }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-site-text-muted">
          {t('rb-note', { defaultValue: 'What you look for in a request (optional)' })}
        </span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
      </label>
      <Button
        type="submit"
        loading={create.isPending}
        disabled={companyName.trim().length < 2 || roles.trim().length < 2}
      >
        {t('rb-post', { defaultValue: 'Post offer' })}
      </Button>
    </form>
  );
}

function RequestForm({ offerId, onDone }: { offerId: string; onDone: () => void }) {
  const { t } = useTranslation('f-ladder-homes');
  const [pitch, setPitch] = useState('');
  const send = useMutation({
    mutationFn: () =>
      apiJson(`/api/rmhladder/referrals/${offerId}/request`, { method: 'POST', body: { pitch } }),
    onSuccess: () => {
      toast.success(t('rb-request-sent', { defaultValue: 'Request sent.' }));
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <Textarea
        value={pitch}
        onChange={(e) => setPitch(e.target.value)}
        maxLength={600}
        rows={4}
        aria-label={t('rb-pitch-label', { defaultValue: 'Your pitch' })}
        placeholder={t('rb-pitch', {
          defaultValue:
            'Who you are, the role you are targeting, and why you fit (20–600 characters).',
        })}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          loading={send.isPending}
          disabled={pitch.trim().length < 20}
        >
          {t('rb-send', { defaultValue: 'Send request' })}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('rb-cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </form>
  );
}
