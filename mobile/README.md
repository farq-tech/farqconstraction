# فرق بناء — تطبيق iOS

تطبيق آيفون له واجهته الخاصة، مصممة للجوال، ومضمّنة داخل التطبيق. الموقع (construction.farq.sa) لا يتأثر بها.

- الشاشات: `src/mobile/` (الرئيسية، الطلبات، طلب جديد برفع كراسة PDF أو كتابة البنود، المراسلات، الموردون، التقارير، الأسعار، الحساب).
- تستخدم نفس دوال الاتصال في `src/api/` وتكلّم `https://api.farq.sa` مباشرة.
- إعداد البناء: `vite.mobile.config.ts` ← يخرج إلى `mobile/www`.
- معرّف التطبيق: `sa.farq.construction` · الفريق: MH7J92HV9N.

## البناء والتشغيل

```sh
cd mobile
npm install
npm run build     # يبني الواجهة ويزامنها مع مشروع Xcode
npx cap open ios  # ثم ▶︎ على محاكي أو جهاز
```

## الرفع إلى TestFlight

ارفع رقم البناء (CURRENT_PROJECT_VERSION) ثم: Product ← Archive ← Distribute App ← App Store Connect.
