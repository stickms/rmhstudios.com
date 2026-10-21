import { createFileRoute } from '@tanstack/react-router';
import { BotAdminPage } from '@/components/admin/bots/BotAdminPage';

export const Route = createFileRoute('/_site/admin/bots')({
  head: () => ({ meta: [{ title: 'AI Bots | Admin | RMH Studios' }] }),
  component: BotAdminPage,
});
