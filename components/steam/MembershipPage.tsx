'use client';

import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Tier } from '@/lib/entitlements/tiers';
import { PLANS, planCopy } from '@/components/membership/MembershipPanel';
import { useMembershipActions } from '@/components/membership/useMembershipActions';
import { StoreNav } from './StoreNav';
import { planAction } from './store-view';

const RETURN_PATH = '/games/membership';

/** The membership plans, drawn as Steam draws a subscription page. */
export function MembershipPage({ currentTier }: { currentTier: Tier | null }) {
  const { t } = useTranslation('games-hub');
  const { t: ts } = useTranslation('site');
  const COPY = planCopy(ts);
  const { busy, status, subscribe, manageBilling } = useMembershipActions(RETURN_PATH);
  const paying = currentTier !== null && currentTier !== 'free';

  return (
    <div className="stm-web">
      <StoreNav />
      <div className="stm-shop">
        <header className="stm-shop-head">
          <h1 className="stm-web-title">{t('steam-membership-title', { defaultValue: 'Membership' })}</h1>
          {paying ? (
            <button type="button" className="stm-btn stm-btn-ghost" disabled={busy === 'portal'} onClick={() => void manageBilling()}>
              {t('steam-membership-billing', { defaultValue: 'Manage billing' })}
            </button>
          ) : null}
        </header>
        <p className="stm-muted">
          {t('steam-membership-sub', {
            defaultValue: 'Billed monthly, cancel anytime. Checkout is handled by Stripe.',
          })}
        </p>

        {status ? (
          <p className="stm-web-card stm-web-pad" role="status">
            {status === 'success'
              ? t('steam-membership-success', { defaultValue: 'Thanks. Your membership is being set up and will show here shortly.' })
              : t('steam-membership-cancelled', { defaultValue: 'Checkout was cancelled. You were not charged.' })}
          </p>
        ) : null}

        <ul className="stm-shop-grid">
          {PLANS.map((plan) => {
            const copy = COPY[plan.tier];
            const action = planAction(plan.tier, plan.cta, currentTier);
            return (
              <li key={plan.tier} className="stm-web-card stm-shop-item" style={plan.featured ? { borderTop: '2px solid var(--stm-blue)' } : undefined}>
                <div className="stm-shop-body">
                  <p className="stm-shop-name">{copy.name}</p>
                  <p className="stm-membership-price">
                    {plan.price}
                    <span className="stm-muted">{copy.period}</span>
                  </p>
                  <p className="stm-muted stm-shop-desc">{copy.tagline}</p>
                  <ul className="stm-membership-features">
                    {copy.features.map((f) => (
                      <li key={f}>
                        <Check size={14} aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stm-shop-act">
                  {action === 'current' || action === 'included' ? (
                    <span className="stm-btn stm-btn-ghost" aria-disabled="true">
                      {action === 'current'
                        ? t('steam-membership-current', { defaultValue: 'Current plan' })
                        : t('steam-membership-included', { defaultValue: 'Included' })}
                    </span>
                  ) : action === 'signin' ? (
                    <a className="stm-btn stm-btn-blue" href={`/login?callbackURL=${encodeURIComponent(RETURN_PATH)}`}>
                      {t('steam-membership-signin', { defaultValue: 'Sign in' })}
                    </a>
                  ) : action === 'contact' ? (
                    <a className="stm-btn stm-btn-ghost" href="mailto:team@rmhstudios.com?subject=Enterprise%20plan">
                      {t('steam-membership-contact', { defaultValue: 'Contact us' })}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="stm-btn stm-btn-blue"
                      disabled={busy === plan.tier}
                      onClick={() => void subscribe(plan.tier as 'starter' | 'pro')}
                    >
                      {action === 'upgrade'
                        ? t('steam-membership-upgrade', { defaultValue: 'Upgrade' })
                        : t('steam-membership-subscribe', { defaultValue: 'Subscribe' })}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
