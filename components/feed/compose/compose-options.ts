import {
  Globe,
  Users,
  Lock,
  Star,
  AtSign,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The audience and who-can-reply option lists, with their localized labels.
 * Hooks (they read the `feed` namespace), so they are called from the
 * components that render the options rather than from the composer.
 */
export function useAudienceOptions() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  return [
    {
      value:
        'PUBLIC',
      label:
        t(
          'audience-everyone',
          {
            defaultValue:
              'Everyone',
          },
        ),
      icon: Globe,
    },
    {
      value:
        'FOLLOWERS',
      label:
        t(
          'audience-followers',
          {
            defaultValue:
              'Followers',
          },
        ),
      icon: Users,
    },
    {
      value:
        'CIRCLE',
      label:
        t(
          'audience-circle',
          {
            defaultValue:
              'Close friends',
          },
        ),
      icon: Star,
    },
    {
      value:
        'PRIVATE',
      label:
        t(
          'audience-only-me',
          {
            defaultValue:
              'Only me',
          },
        ),
      icon: Lock,
    },
  ] as const;
}

export function useReplyOptions() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  return [
    {
      value:
        'EVERYONE',
      label:
        t(
          'reply-everyone',
          {
            defaultValue:
              'Everyone can reply',
          },
        ),
      short:
        t(
          'reply-everyone-short',
          {
            defaultValue:
              'Everyone',
          },
        ),
      icon: Globe,
    },
    {
      value:
        'FOLLOWING',
      label:
        t(
          'reply-following',
          {
            defaultValue:
              'Accounts you follow',
          },
        ),
      short:
        t(
          'reply-following-short',
          {
            defaultValue:
              'Following',
          },
        ),
      icon: Users,
    },
    {
      value:
        'MENTIONED',
      label:
        t(
          'reply-mentioned',
          {
            defaultValue:
              'Only accounts you mention',
          },
        ),
      short:
        t(
          'reply-mentioned-short',
          {
            defaultValue:
              'Mentioned',
          },
        ),
      icon: AtSign,
    },
  ] as const;
}
