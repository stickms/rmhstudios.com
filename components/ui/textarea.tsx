
import * as React from "react"
import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full glass-inset text-site-text px-3.5 py-2.5 text-sm transition-[color,box-shadow,border-color,background-color] placeholder:text-site-text-dim hover:border-site-border-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50 focus-visible:border-site-accent focus-visible:bg-site-glass-tint disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
