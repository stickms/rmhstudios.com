/**
 * Admin User Builds Route
 */

import { createFileRoute } from '@tanstack/react-router';
import AdminUserBuildsPage from '@/app/admin/user-builds/page';

export const Route = createFileRoute('/admin/user-builds/')({
  component: AdminUserBuildsPage,
});
