import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import '@/components/slice-it/slice-it.css'

function SliceItLayout() {
  return (
    <div style={{ fontFamily: '"Outfit", sans-serif' }} className="slice-theme min-h-screen text-slate-700 dark:text-slate-200 transition-colors duration-300">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap"
      />
      <Outlet />
      <Toaster />
    </div>
  )
}

export const Route = createFileRoute('/slice-it')({
  component: SliceItLayout,
})
