import { useState } from "react";
import type { FormEvent } from "react";
import type { NavProps } from "../types";
import { farqSession, FarqAuthError } from "../api/farqSession";
import {
  DEFAULT_COMPANY_PROFILE,
  saveCompanyProfile,
} from "../lib/companyProfile";

export function ContractorSignupView({ navigate }: NavProps) {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    city: "",
    phone: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (form.password !== form.confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setBusy(true);
    try {
      await farqSession.signUp(form.email.trim(), form.password, {
        companyName: form.companyName,
        contactName: form.contactName,
        city: form.city,
        phone: form.phone,
        contactConsent: consent,
      });
      saveCompanyProfile({
        ...DEFAULT_COMPANY_PROFILE,
        name: form.companyName.trim(),
        legalName: form.companyName.trim(),
        city: form.city.trim(),
        defaultDeliveryCity: form.city.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
      setForm((current) => ({ ...current, password: "", confirm: "" }));
      setDone(true);
    } catch (err) {
      setError(
        err instanceof FarqAuthError && err.status === 409
          ? "هذا البريد لديه حساب. استخدم تسجيل الدخول."
          : err instanceof FarqAuthError && err.status === 429
            ? "محاولات كثيرة. انتظر قليلًا ثم حاول مرة ثانية."
            : err instanceof FarqAuthError && err.status === 400
              ? "راجع بيانات المنشأة ورقم الجوال وكلمة المرور."
              : "تعذّر إكمال التسجيل. تحقق من الاتصال وحاول مرة ثانية. إذا سبق أن أنشأت حسابًا، سجّل الدخول.",
      );
    } finally {
      setBusy(false);
    }
  }
  const fields = [
    [
      "companyName",
      "اسم المنشأة",
      "text",
      "organization",
      "شركة أو مؤسسة المقاولات",
    ],
    ["contactName", "اسم المسؤول", "text", "name", "الاسم الكامل"],
    ["city", "المدينة", "text", "address-level2", "مثال: الرياض"],
    ["phone", "رقم الجوال", "tel", "tel", "05xxxxxxxx"],
    ["email", "البريد الإلكتروني", "email", "email", "name@company.sa"],
    ["password", "كلمة المرور", "password", "new-password", "8 أحرف على الأقل"],
    [
      "confirm",
      "تأكيد كلمة المرور",
      "password",
      "new-password",
      "أعد كتابة كلمة المرور",
    ],
  ] as const;
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#FAFAF8] text-[#0D1F1D] px-5 py-8 sm:py-14"
    >
      <div className="max-w-5xl mx-auto">
        <a
          href="/how-it-works"
          className="font-black text-xl text-[#123F3A] inline-flex items-center gap-3"
        >
          <span className="bg-[#123F3A] text-[#CFF5DC] rounded-xl p-3">ف</span>{" "}
          فرق بناء
        </a>
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-20 mt-10 items-start">
          <section className="lg:sticky lg:top-14">
            <p className="text-sm font-bold text-[#123F3A] mb-4">
              للمقاولين وفرق المشتريات
            </p>
            <h1 className="text-3xl sm:text-5xl font-black leading-tight">
              ابدأ من منشأتك.
              <br />
              والكراسة بعدها.
            </h1>
            <p className="mt-6 text-neutral-600 leading-8 max-w-md">
              سجّل حسابك في فرق بناء، وارفع بنود مشروعك عشان تجمع عروض الموردين
              وتقارن قبل قرار الشراء.
            </p>
            <ol className="mt-8 space-y-4">
              {[
                "سجّل بيانات منشأتك",
                "ارفع الكراسة أو أضف البنود",
                "اجمع العروض وقارن واختر",
              ].map((text, i) => (
                <li key={text} className="flex items-center gap-4">
                  <span className="rounded-full bg-[#E8F0EA] w-9 h-9 flex items-center justify-center text-[#123F3A] font-bold">
                    {i + 1}
                  </span>
                  {text}
                </li>
              ))}
            </ol>
            <p className="mt-8 text-sm text-neutral-500">
              عندك حساب؟{" "}
              <button
                type="button"
                onClick={() => navigate("login")}
                className="font-bold text-[#123F3A] underline underline-offset-4"
              >
                تسجيل الدخول
              </button>
            </p>
          </section>
          <section className="bg-white border border-neutral-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            {done ? (
              <div role="status" className="py-10 text-center">
                <span className="inline-flex bg-[#E8F0EA] rounded-full w-16 h-16 items-center justify-center text-3xl text-[#123F3A]">
                  ✓
                </span>
                <h2 className="text-2xl font-black mt-5">حساب منشأتك جاهز</h2>
                <p className="mt-4 text-neutral-600 leading-7">
                  تم حفظ بيانات التسجيل. تقدر تبدأ الآن بإضافة كراسة مشروعك.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("create-upload")}
                  className="mt-8 rounded-xl bg-[#123F3A] text-white py-4 px-6 w-full font-bold"
                >
                  ابدأ طلب تسعير
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2 className="font-black text-xl mb-6">إنشاء حساب مقاول</h2>
                {error && (
                  <p
                    role="alert"
                    className="bg-red-50 text-red-700 rounded-xl p-4 text-sm mb-5"
                  >
                    {error}
                  </p>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  {fields.map(([key, label, type, complete, placeholder]) => (
                    <div
                      key={key}
                      className={
                        key === "companyName" ||
                        key === "email" ||
                        key === "confirm"
                          ? "sm:col-span-2"
                          : ""
                      }
                    >
                      <label
                        htmlFor={`signup-${key}`}
                        className="text-sm font-bold block mb-2"
                      >
                        {label}
                      </label>
                      <input
                        id={`signup-${key}`}
                        required
                        type={type}
                        autoComplete={complete}
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                        disabled={busy}
                        minLength={
                          type === "password"
                            ? 8
                            : type === "text"
                              ? 2
                              : undefined
                        }
                        maxLength={
                          type === "password" ? 128 : key === "phone" ? 20 : 200
                        }
                        pattern={
                          key === "phone"
                            ? "(05[0-9]{8}|\\+9665[0-9]{8})"
                            : undefined
                        }
                        dir={
                          ["phone", "email", "password", "confirm"].includes(
                            key,
                          )
                            ? "ltr"
                            : "rtl"
                        }
                        placeholder={placeholder}
                        className="w-full min-w-0 rounded-xl border border-neutral-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#123F3A] disabled:opacity-60"
                      />
                    </div>
                  ))}
                </div>
                <label className="flex gap-3 items-start text-sm text-neutral-600 leading-6 mt-5">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={busy}
                    className="mt-1 accent-[#123F3A]"
                  />
                  <span>
                    أوافق على حفظ بيانات المنشأة والتواصل معي بخصوص حسابي وطلبات
                    التسعير.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full mt-6 py-4 rounded-xl bg-[#123F3A] text-white font-bold hover:bg-[#1a5c54] disabled:opacity-60"
                >
                  {busy ? "جارٍ إنشاء الحساب…" : "أنشئ حساب المنشأة"}
                </button>
                <p className="text-xs text-neutral-500 leading-6 mt-4">
                  التسجيل لا يرسل طلبات تسعير تلقائيًا. أنت تراجع طلبك وتقرر
                  إرساله.
                </p>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
