import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
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
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-xl font-semibold" style={{ color: "var(--site-text, #fff)" }}>
            Something went wrong
          </h2>
          <p className="max-w-md text-sm" style={{ color: "var(--site-text-secondary, #aaa)" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: "var(--site-accent, #3b82f6)",
              color: "#fff",
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
