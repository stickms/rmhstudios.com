import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { PasswordTool } from '@/components/toolbox/password/PasswordTool';

export const Route = createFileRoute('/_site/tools/password')({
  head: definePage({
    path: '/tools/password',
    title: 'Password and Passphrase Generator | RMH Studios',
    description:
      'Generate strong random passwords and passphrases on your device, with exact entropy, and check a password’s strength.',
  }),
  component: PasswordTool,
});
