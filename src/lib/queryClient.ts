import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const status = typeof error === "object" && error && "status" in error
          ? Number((error as { status?: number }).status)
          : 0
        if (status === 401 || status === 403 || status === 404) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

export const queryKeys = {
  constructionStatus: ["construction", "status"] as const,
  me: ["construction", "me"] as const,
  projects: ["construction", "projects"] as const,
  project: (projectId: string) => ["construction", "projects", projectId] as const,
  projectSnapshot: (projectId: string, boqVersionId?: string) =>
    ["construction", "projects", projectId, "snapshot", boqVersionId ?? "active"] as const,
  rfqs: ["construction", "rfqs"] as const,
  rfq: (rfqId: string) => ["construction", "rfqs", rfqId] as const,
  rfqOffers: (rfqId: string) => ["construction", "rfqs", rfqId, "offers"] as const,
  rfqComparison: (rfqId: string) => ["construction", "rfqs", rfqId, "comparison"] as const,
  itemSuppliers: (itemId: string, versionId?: string) =>
    ["construction", "items", itemId, "suppliers", versionId ?? "active"] as const,
}
