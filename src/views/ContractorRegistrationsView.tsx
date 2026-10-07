import { useEffect, useState } from "react";
import { apiBase } from "../api/apiBase";
import { farqSession } from "../api/farqSession";
import type { NavProps } from "../types";
type Registration = {
  user_id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  city: string;
  email: string;
  created_at: string;
  notification_status: string;
};
export function ContractorRegistrationsView({ navigate }: NavProps) {
  const [rows, setRows] = useState<Registration[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void fetch(`${apiBase()}/api/auth/contractor-registrations`, {
      headers: { Authorization: `Bearer ${farqSession.getAccessToken()}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "هذه الصفحة خاصة بإدارة فرق."
              : "تعذّر تحميل التسجيلات. حاول مرة ثانية.",
          );
        const payload = await response.json();
        setRows(payload.data.registrations);
        setConfigured(payload.data.email_configured);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [refresh]);
  const status: Record<string, string> = {
    PENDING: "بانتظار الإرسال",
    RETRY: "جارٍ إعادة المحاولة",
    ACCEPTED: "قَبِل مزود البريد الإشعار",
    FAILED: "تعذّر إرسال الإشعار",
    UNKNOWN: "حالة الإرسال غير مؤكدة — تحتاج مراجعة",
  };
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#FAFAF8] p-5 sm:p-10 text-[#0D1F1D]"
    >
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate("home")}
          className="text-[#123F3A] font-bold mb-8"
        >
          ← العودة لفرق بناء
        </button>
        <div className="flex justify-between items-center gap-4">
          <h1 className="text-2xl font-black">تسجيلات المقاولين</h1>
          <button
            disabled={busy}
            onClick={() => setRefresh(refresh + 1)}
            className="bg-[#123F3A] text-white px-5 py-3 rounded-xl disabled:opacity-50"
          >
            تحديث
          </button>
        </div>
        <p className="text-neutral-600 text-sm mt-3">
          آخر 200 تسجيل. بيانات المنشآت مُدخلة من أصحاب الحسابات ولم يتم التحقق
          منها.
        </p>
        {error ? (
          <p role="alert" className="mt-8 text-red-700">
            {error}
          </p>
        ) : busy ? (
          <p role="status" className="mt-8">
            جارٍ تحميل التسجيلات…
          </p>
        ) : (
          <>
            {!configured && (
              <p className="mt-6 bg-amber-50 text-amber-800 rounded-xl p-4">
                إشعارات البريد غير مهيأة حاليًا. التسجيلات محفوظة هنا.
              </p>
            )}
            <div className="space-y-4 mt-8">
              {rows.length === 0 && <p>ما فيه تسجيلات مقاولين حتى الآن.</p>}
              {rows.map((row) => (
                <article
                  key={row.user_id}
                  className="bg-white border border-neutral-200 rounded-2xl p-5"
                >
                  <h2 className="font-bold text-lg">{row.company_name}</h2>
                  <p className="text-neutral-600 mt-2">
                    {row.contact_name} · {row.city}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-3">
                    <a
                      dir="ltr"
                      className="text-[#123F3A] underline break-all"
                      href={`mailto:${row.email}`}
                    >
                      {row.email}
                    </a>
                    <a
                      dir="ltr"
                      className="text-[#123F3A] underline"
                      href={`tel:${row.phone}`}
                    >
                      {row.phone}
                    </a>
                  </div>
                  <p className="text-sm mt-4">
                    {new Date(row.created_at).toLocaleString("ar-SA", {
                      timeZone: "Asia/Riyadh",
                    })}
                  </p>
                  <p className="text-xs text-neutral-500 mt-2">
                    {status[row.notification_status] || row.notification_status}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
