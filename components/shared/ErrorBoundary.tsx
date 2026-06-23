import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { t } = useTranslation("shared")
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold" style={{ color: "var(--site-text, #fff)" }}>
        {t("error-boundary-title", { defaultValue: "Something went wrong" })}
      </h2>
      <p className="max-w-md text-sm" style={{ color: "var(--site-text-secondary, #aaa)" }}>
        {error?.message || t("error-boundary-message", { defaultValue: "An unexpected error occurred." })}
      </p>
      <button
        onClick={onRetry}
        className="mt-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        style={{
          background: "var(--site-accent, #3b82f6)",
          color: "#fff",
        }}
      >
        {t("error-boundary-retry", { defaultValue: "Try Again" })}
      </button>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      )
    }

    return this.props.children
  }
}
