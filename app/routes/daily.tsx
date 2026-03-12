/**
 * Daily Puzzles Layout — wraps all /daily routes.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router'

function DailyLayout() {
    return (
        <div className="min-h-screen bg-site-bg text-site-text pt-8 pb-16">
            <Outlet />
        </div>
    )
}

export const Route = createFileRoute('/daily')({
    component: DailyLayout,
})
