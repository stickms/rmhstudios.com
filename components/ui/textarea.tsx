
import * as React from "react"
import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-site-sm border border-site-border bg-site-bg text-site-text px-3 py-2 text-sm transition-[color,box-shadow,border-color] placeholder:text-site-text-dim hover:border-site-border-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40 focus-visible:border-site-accent disabled:cursor-not-allowed disabled:opacity-50",
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
