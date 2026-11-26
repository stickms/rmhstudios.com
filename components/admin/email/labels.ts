import type { TFunction } from 'i18next';
import type { CampaignCategory } from '@/lib/email/preferences';

// Literal t() keys per category: i18next-cli cannot see a templated key.
export function categoryName(t: TFunction, category: CampaignCategory): string {
  switch (category) {
    case 'announcements':
      return t('email-category-announcements', {
        defaultValue: 'Announcement',
      });
    case 'product':
      return t('email-category-product', {
        defaultValue: 'Product news',
      });
    case 'service':
      return t('email-category-service', {
        defaultValue: 'Required notice',
      });
  }
}

export function categoryHelp(t: TFunction, category: CampaignCategory): string {
  switch (category) {
    case 'announcements':
      return t('email-category-announcements-desc', {
        defaultValue:
          'Site news. On by default; people who turned announcement emails off are left out. Nobody gets more than one announcement or product email every 48 hours, or the same message twice.',
      });
    case 'product':
      return t('email-category-product-desc', {
        defaultValue:
          'New games, apps and features. Only people who turned product news on get it. Nobody gets more than one announcement or product email every 48 hours, or the same message twice.',
      });
    case 'service':
      return t('email-category-service-desc', {
        defaultValue:
          'Sent to everyone in the audience, whatever their email settings, with no unsubscribe link. Only for notices people must receive: a security breach, a change to the terms, an outage affecting their account. Still never sent to the same person twice.',
      });
  }
}
