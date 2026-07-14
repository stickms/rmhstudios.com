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
            "flex h-11 w-full appearance-none glass-inset px-3.5 py-1.5 pr-9 text-sm text-site-text transition-[color,box-shadow,border-color,background-color] hover:border-site-border-bright",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50 focus-visible:border-site-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
