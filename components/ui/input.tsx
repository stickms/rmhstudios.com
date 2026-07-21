
import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // .glass-inset: a recessed well (ink fill + inverted inner shadow, no
          // backdrop blur — legibility + cost). Focus fills the well with light.
          // §15.4: px-3.5 py-2.5 is the canonical well interior padding (text never
          // touches the glass edge); h-11 keeps the 44px mobile tap target.
          "flex h-11 w-full glass-inset text-site-text px-3.5 py-2.5 text-sm transition-[color,box-shadow,border-color,background-color] placeholder:text-site-text-dim hover:border-site-border-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50 focus-visible:border-site-accent focus-visible:bg-site-glass-tint disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
