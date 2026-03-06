/**
 * Admin Users Route
 */

import { createFileRoute } from '@tanstack/react-router';
import AdminUsersPage from '@/app/admin/users/page';

export const Route = createFileRoute('/admin/users/')({
  component: AdminUsersPage,
});
