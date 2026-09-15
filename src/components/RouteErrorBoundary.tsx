import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  title?: string
  onRetry?: () => void
}

interface State {
  error: Error | null
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RouteErrorBoundary]", error, info.componentStack)
  }

  private retry = () => {
    this.props.onRetry?.()
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center" role="alert">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
          <span className="text-red-600 text-xl font-black">!</span>
        </div>
        <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">
          {this.props.title ?? "تعذر عرض هذه الصفحة"}
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed mb-6">
          حدث خطأ غير متوقع. بياناتك المحفوظة على الخادم لم تُمس. يمكنك إعادة المحاولة.
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="w-full sm:w-auto px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm hover:bg-[#1a5c54] transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    )
  }
}
