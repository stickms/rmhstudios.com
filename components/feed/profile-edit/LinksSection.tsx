import { useTranslation } from 'react-i18next';
import { Link as LinkIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_PROFILE_LINKS } from '@/lib/profile-limits';
import { FieldHeader } from './FieldHeader';
import { MAX_LOCATION, MAX_WEBSITE, type ProfileLink } from './profile-edit-state';
import type { ProfileEditForm } from './useProfileEditForm';

export function LinksSection({
  form,
}: {
  form: Pick<
    ProfileEditForm,
    'location' | 'setLocation' | 'website' | 'setWebsite' | 'links' | 'setLinks'
  >;
}) {
  const { t } = useTranslation('feed');
  const { location, setLocation, website, setWebsite, links, setLinks } = form;
  return (
    <div role="tabpanel" className="space-y-5">
      <div>
        <FieldHeader
          htmlFor="profile-location"
          label={t('location-label', { defaultValue: 'Location' })}
        />
        <Input
          id="profile-location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          maxLength={MAX_LOCATION}
          placeholder={t('location-placeholder', {
            defaultValue: 'Where are you based?',
          })}
        />
      </div>
      <div>
        <FieldHeader
          htmlFor="profile-website"
          label={t('website-label', { defaultValue: 'Website' })}
        />
        <Input
          id="profile-website"
          type="url"
          inputMode="url"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          maxLength={MAX_WEBSITE}
          placeholder="https://example.com"
        />
      </div>
      <div>
        <FieldHeader
          label={t('links-label', { defaultValue: 'Featured links' })}
          hint={t('links-editor-hint', {
            defaultValue: 'Add up to five links. They appear as quick-access glass chips.',
          })}
          count={`${links.length}/${MAX_PROFILE_LINKS}`}
        />
        <div className="space-y-3">
          {links.map((link: ProfileLink, index: number) => (
            <div key={index} className="glass-fill rounded-site-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-site-bg-subtle text-site-accent">
                  <LinkIcon className="size-4" aria-hidden />
                </span>
                <Input
                  value={link.label}
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                  maxLength={30}
                  placeholder={t('link-label-placeholder', { defaultValue: 'Label' })}
                  aria-label={t('link-label-aria', {
                    count: index + 1,
                    defaultValue: 'Link {{count}} label',
                  })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-site-danger"
                  onClick={() =>
                    setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  aria-label={t('remove-link-aria', {
                    count: index + 1,
                    defaultValue: 'Remove link {{count}}',
                  })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <Input
                type="url"
                inputMode="url"
                value={link.url}
                onChange={(event) =>
                  setLinks((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, url: event.target.value } : item,
                    ),
                  )
                }
                maxLength={200}
                placeholder="https://example.com"
                aria-label={t('link-url-aria', {
                  count: index + 1,
                  defaultValue: 'Link {{count}} URL',
                })}
                className="mt-2"
              />
            </div>
          ))}
        </div>
        {links.length < MAX_PROFILE_LINKS ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="mt-3"
            onClick={() => setLinks((current) => [...current, { label: '', url: '' }])}
          >
            <Plus aria-hidden />
            {t('add-link', { defaultValue: 'Add link' })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
