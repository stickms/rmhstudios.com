/**
 * s03-13 — a community's rules where members read them: the numbered list (rail
 * and dialog on the community page, and inside the onboarding sheet) and the
 * agreement dialog a join passes through when the community requires it.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { CommunityRuleDTO } from '@/lib/communities/rules';

/** The rules as an ordered list of rows on rules; a description opens under its title. */
export function RulesList({ rules, className }: { rules: CommunityRuleDTO[]; className?: string | undefined }) {
  const { t } = useTranslation('community-rules');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className={cn('flex flex-col', className)}>
      {rules.map((r) => {
        const expanded = open === r.id;
        const panelId = `rule-${r.id}`;
        return (
          <li key={r.id} className="border-b border-site-border last:border-b-0">
            {r.description ? (
              <>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="flex min-h-9 w-full items-center gap-2 py-2 text-start"
                >
                  <span className="t-meta w-5 shrink-0">{r.position}</span>
                  <span className="t-body min-w-0 flex-1 text-site-text">{r.title}</span>
                  <ChevronDown
                    aria-hidden
                    className={cn('size-4 shrink-0 text-site-text-muted', expanded && 'rotate-180')}
                  />
                  <span className="sr-only">
                    {expanded
                      ? t('rule-collapse', {
                          defaultValue: 'Hide description',
                        })
                      : t('rule-expand', {
                          defaultValue: 'Show description',
                        })}
                  </span>
                </button>
                {expanded && (
                  <p dir="auto" id={panelId} className="t-body ps-7 pb-3 text-site-text-muted">
                    {r.description}
                  </p>
                )}
              </>
            ) : (
              <div className="flex min-h-9 items-center gap-2 py-2">
                <span className="t-meta w-5 shrink-0">{r.position}</span>
                <span className="t-body min-w-0 flex-1 text-site-text">{r.title}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The community page's rules: a numbered section on wider screens, a "Rules" link
 * that opens the same list in a dialog on narrow ones. Renders nothing without rules.
 */
export function CommunityRulesRail({
  rules,
  communityName,
  className,
}: {
  rules: CommunityRuleDTO[];
  communityName: string;
  className?: string | undefined;
}) {
  const { t } = useTranslation('community-rules');
  const [open, setOpen] = useState(false);
  if (rules.length === 0) return null;
  const title = t('rules-title', {
    defaultValue: 'Rules',
  });
  return (
    <section
      aria-label={t('rules-label', {
        defaultValue: 'Community rules',
      })}
      className={cn('border-b border-site-border px-4 py-3', className)}
    >
      <div className="hidden sm:block">
        <h3 className="t-label mb-1">{title}</h3>
        <RulesList rules={rules} />
      </div>
      <div className="sm:hidden">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {t('rules-link', {
            count: rules.length,
            defaultValue: 'Rules ({{count}})',
          })}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('rules-dialog-title', {
                  name: communityName,
                  defaultValue: 'Rules of {{name}}',
                })}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t('rules-dialog-description', {
                  defaultValue: 'The rules members agree to follow.',
                })}
              </DialogDescription>
            </DialogHeader>
            <RulesList rules={rules} className="max-h-[60vh] overflow-y-auto" />
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}

/** The agreement tick, labelled; shared by the join dialog and the onboarding sheet. */
export function RulesAgreement({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation('community-rules');
  return (
    <label className="t-body flex min-h-9 cursor-pointer items-center gap-3 text-site-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-(--site-accent)"
      />
      <span>
        {t('agree-label', {
          defaultValue: 'I have read the rules',
        })}
      </span>
    </label>
  );
}

/** Shown before a join when the community requires agreement; Join stays off until ticked. */
export function RulesAgreementDialog({
  open,
  communityName,
  rules,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  communityName: string;
  rules: CommunityRuleDTO[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('community-rules');
  const [agreed, setAgreed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setAgreed(false);
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('agree-title', {
              name: communityName,
              defaultValue: 'Join {{name}}',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('agree-description', {
              defaultValue: 'This community asks every member to read its rules first.',
            })}
          </DialogDescription>
        </DialogHeader>
        <RulesList rules={rules} className="max-h-[50vh] overflow-y-auto" />
        <RulesAgreement checked={agreed} onChange={setAgreed} />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('agree-cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={!agreed} loading={busy}>
            {t('agree-join', {
              defaultValue: 'Join',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
