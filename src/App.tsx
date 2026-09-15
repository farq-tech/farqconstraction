import { QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "@/app/AuthProvider"
import AppRouter from "@/app/AppRouter"
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary"
import { queryClient } from "@/lib/queryClient"

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouteErrorBoundary title="تعذر تشغيل التطبيق">
          <AppRouter />
        </RouteErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  )
}
