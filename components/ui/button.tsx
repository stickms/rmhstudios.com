import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-site-sm text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-site-accent/40 focus-visible:ring-[3px] aria-invalid:ring-site-danger/30 aria-invalid:border-site-danger",
  {
    variants: {
      variant: {
        default:
          "bg-site-accent text-site-accent-fg hover:bg-site-accent-hover",
        destructive:
          "bg-site-danger text-white hover:bg-site-danger/90 focus-visible:ring-site-danger/30",
        danger:
          "bg-site-danger text-white hover:bg-site-danger/90 focus-visible:ring-site-danger/30",
        outline:
          "border border-site-border bg-transparent text-site-text hover:bg-site-surface-hover hover:border-site-border-bright",
        secondary:
          "border border-site-border bg-site-surface text-site-text hover:bg-site-surface-hover",
        ghost:
          "text-site-text hover:bg-site-surface-hover",
        link: "text-site-accent underline-offset-4 hover:underline",
        accent:
          "bg-site-accent text-site-accent-fg hover:bg-site-accent-hover focus-visible:ring-site-accent/40",
        "accent-outline":
          "border border-site-accent text-site-accent hover:bg-site-accent-dim focus-visible:ring-site-accent/40",
        "accent-ghost":
          "text-site-accent hover:bg-site-accent-dim",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-site-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-site-sm gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-site-sm px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-site-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
