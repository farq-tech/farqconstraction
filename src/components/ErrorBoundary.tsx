import { Component, type ReactNode } from 'react'

/**
 * A screen that throws while drawing must not take the whole app with it.
 * Without this, one bad value from the server blanked the page white with no
 * way back but a manual refresh. The saved booklet is untouched.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('screen failed to render', error)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center" dir="rtl">
        <div className="text-lg font-black text-[#0D1F1D] mb-2">تعذّر عرض هذه الصفحة</div>
        <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
          حدث خطأ أثناء عرضها. عملك المحفوظ لم يتأثر. أعد التحميل، وإن تكرر الأمر تواصل مع فرق.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
        >
          أعد التحميل
        </button>
      </div>
    )
  }
}
