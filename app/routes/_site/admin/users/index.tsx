/**
 * Admin Users Route
 */

import { createFileRoute } from '@tanstack/react-router';
import AdminUsersPage from '@/components/admin/AdminUsersPage';

export const Route = createFileRoute('/_site/admin/users/')({
  component: AdminUsersPage,
});
