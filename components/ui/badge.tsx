import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

/**
 * Shared pill/badge primitive. Consolidates the many inline
 * `inline-flex items-center gap-1 rounded-full …` chips scattered across the
 * feed, profile, predictions and shop columns into one token-driven component
 * so every status/label pill looks the same.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap shrink-0 transition-colors [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: "border border-site-border bg-site-surface text-site-text-muted",
        accent: "bg-site-accent-dim text-site-accent",
        solid: "bg-site-accent text-site-accent-fg",
        success: "bg-site-success/15 text-site-success",
        warning: "bg-site-warning/15 text-site-warning",
        danger: "bg-site-danger/15 text-site-danger",
        outline: "border border-site-border text-site-text-muted",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        default: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
