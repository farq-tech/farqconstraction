import { useQuery } from "@tanstack/react-query"
import { constructionApi } from "@/lib/api/construction"
import { queryKeys } from "@/lib/queryClient"
import { FarqApiError } from "@/lib/api/types"

/** Non-blocking health chip — never replaces page content on failure. */
export default function ConstructionStatusChip() {
  const query = useQuery({
    queryKey: queryKeys.constructionStatus,
    queryFn: async ({ signal }) => {
      const res = await constructionApi.status(signal)
      return res.data
    },
    staleTime: 60_000,
    retry: 1,
  })

  if (query.isLoading) {
    return (
      <div className="text-xs text-neutral-400 font-medium px-1 py-1">
        جاري التحقق من خدمة البناء…
      </div>
    )
  }

  if (query.isError) {
    const message =
      query.error instanceof FarqApiError
        ? query.error.message
        : "تعذر الاتصال بخدمة البناء"
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <span className="font-semibold">{message}</span>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="font-bold underline shrink-0"
        >
          إعادة المحاولة
        </button>
      </div>
    )
  }

  const flags = query.data?.flags
  return (
    <div className="rounded-xl border border-[#123F3A]/10 bg-[#f0faf7] px-3 py-2 text-xs text-[#123F3A]">
      <span className="font-bold">خدمة البناء متصلة</span>
      <span className="text-[#123F3A]/70">
        {" "}
        · قراءة {flags?.read ? "مفعّلة" : "موقوفة"} · RFQ{" "}
        {flags?.rfq ? "مفعّل" : "موقوف"} · كتابة{" "}
        {query.data?.production_writes_enabled ? "إنتاجية" : "محمية"}
      </span>
    </div>
  )
}
