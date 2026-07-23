import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

interface SpinnerProps {
 /** Pixel size of the spinner (default 24). */
 size?: number
 className?: string
 label?: string
}

/**
 * Canonical loading spinner. Replaces the ad-hoc
 * `<Loader2 className="h-6 w-6 animate-spin text-site-accent" />` repeated
 * across 40+ feed components so size/colour stay consistent.
 */
export function Spinner({ size = 24, className, label }: SpinnerProps) {
 return (
 <Loader2
 role="status"
 aria-label={label ?? "Loading"}
 className={cn("animate-spin text-site-accent", className)}
 style={{ width: size, height: size }}
 />
 )
}
