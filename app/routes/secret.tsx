/**
 * Secret Layout Route (auth-gated)
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret')({
  component: SecretLayout,
});

function SecretLayout() {
  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div className="h-full overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
