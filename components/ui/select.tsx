import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            "flex h-11 w-full appearance-none rounded-site-sm border border-site-border bg-site-surface px-3 py-1.5 pr-8 text-sm text-site-text transition-colors hover:border-site-border-bright",
            "focus:outline-none focus:ring-2 focus:ring-site-accent focus:border-site-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
