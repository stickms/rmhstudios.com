import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { Outfit } from 'next/font/google'
import '@/app/slice-it/globals.css'

const outfit = Outfit({ subsets: ['latin'] })

function SliceItLayout() {
  return (
    <div className={`${outfit.className} slice-theme min-h-screen text-slate-700 dark:text-slate-200 transition-colors duration-300`}>
      <Outlet />
      <Toaster />
    </div>
  )
}

export const Route = createFileRoute('/slice-it')({
  component: SliceItLayout,
})
