import { useMemo } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

interface PaginationProps {
  /** Current (1-based) page. */
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Render the "Page X of Y" indicator below the controls (default true). */
  showIndicator?: boolean
  className?: string
}

const navButton =
  "p-2 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover disabled:opacity-20 disabled:cursor-not-allowed transition-[transform,color,background-color] duration-150 active:scale-95 disabled:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg"

/**
 * Shared pagination control. Extracted from the duplicated first/prev/
 * numbered-with-ellipsis/next/last blocks in BlogList and NewsList so both
 * lists (and future ones) share one implementation and look.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  showIndicator = true,
  className,
}: PaginationProps) {
  const { t } = useTranslation("c-ui")
  const safePage = Math.max(1, Math.min(page, totalPages))

  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (safePage > 3) pages.push("...")
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++)
        pages.push(i)
      if (safePage < totalPages - 2) pages.push("...")
      pages.push(totalPages)
    }
    return pages
  }, [totalPages, safePage])

  if (totalPages <= 1) return null

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => onPageChange(1)}
          disabled={safePage === 1}
          className={navButton}
          aria-label={t("first-page", { defaultValue: "First page" })}
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 1}
          className={navButton}
          aria-label={t("prev-page", { defaultValue: "Previous page" })}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pageNumbers.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-site-text-dim text-sm">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={safePage === p ? "page" : undefined}
              className={cn(
                "w-9 h-9 rounded-full text-sm font-bold transition-[transform,color,background-color] duration-150 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg",
                safePage === p
                  ? "bg-site-accent text-site-accent-fg"
                  : "text-site-text-dim hover:text-site-text hover:bg-site-surface-hover"
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage === totalPages}
          className={navButton}
          aria-label={t("next-page", { defaultValue: "Next page" })}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={safePage === totalPages}
          className={navButton}
          aria-label={t("last-page", { defaultValue: "Last page" })}
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
      {showIndicator ? (
        <p className="text-xs text-site-text-dim font-mono">
          {t("page-of", {
            defaultValue: "Page {{page}} of {{total}}",
            page: safePage,
            total: totalPages,
          })}
        </p>
      ) : null}
    </div>
  )
}
