import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/lights-out')({
    beforeLoad: () => {
        throw redirect({ to: '/daily/lights-out' })
    },
})
