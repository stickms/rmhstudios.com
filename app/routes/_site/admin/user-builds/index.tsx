/**
 * Admin User Builds Route
 */

import { createFileRoute } from '@tanstack/react-router';
import AdminUserBuildsPage from '@/components/admin/AdminUserBuildsPage';

export const Route = createFileRoute('/_site/admin/user-builds/')({
  component: AdminUserBuildsPage,
});
