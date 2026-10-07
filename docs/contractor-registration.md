# Contractor registration

Public entry: /?view=signup; marketing buyer CTAs open this route. Existing login links to signup. Form creates a real native account with company/contact/city/Saudi mobile/explicit contact consent, then offers upload. Password confirmation is client-side; API validates all persisted fields and password requirements. No RFQ is dispatched by registration.

Profile is stored on the API and populated into the account-scoped browser company profile. Login on another browser hydrates a missing profile from the authenticated user-only API. Existing browser settings are preserved.

Owner notification destination: server-side CONSTRUCTION_REGISTRATION_NOTIFY_EMAILS, using the existing Resend key and sender. Admin page: /?view=contractor-registrations. The server allows only verified platform owners or explicitly configured operator user IDs; tenant administration never authorizes access. Delivery statuses distinguish provider acceptance from confirmed inbox delivery.

Verification: 13 native session tests, production Vite build; mocked browser signup on 1440, 390 and 320 px with validation/submission/success and no overflow/JavaScript errors. Backend tests exercise atomicity, duplicate rollback, retry and authorization. Actual inbox receipt requires a real registration and provider/inbox verification.
