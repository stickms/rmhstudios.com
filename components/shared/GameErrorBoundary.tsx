import { Component, type ErrorInfo, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"

interface Props {
  children: ReactNode
  gameName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class GameErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[GameErrorBoundary${this.props.gameName ? `: ${this.props.gameName}` : ""}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-black p-8 text-center">
          <h2 className="text-2xl font-bold text-white">
            {this.props.gameName ? `${this.props.gameName} crashed` : "Game crashed"}
          </h2>
          <p className="max-w-md text-sm text-white/60">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Try Again
            </button>
            <Link
              to="/"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
            >
              Return Home
            </Link>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
