# Farq Construction iOS release — 2026-10-05

- Source: `/Users/m4pro/.codex/worktrees/ios-latest`, branch `codex/ios-latest`, aligned with main merge `1477fcb9519a0db5fc20856d9ce03dbef5b2bc1a`.
- Merged PR: https://github.com/farq-tech/farqconstraction/pull/19
- iOS branch integrated into latest main without changing dirty local ios-app checkout.
- Version1.4/build12, bundle sa.farq.construction, Apple team MH7J92HV9N.
- Mobile screens now use shared Ahmad assistant, correct bundled sprite asset base, creator labels, draft edits/revisions, discount request review/scheduling, and item details. Same production construction API as website.
- TypeScript, mobile Vite build, Capacitor sync, 1845 tests/64files pass.
- Signed archive succeeded: `/Users/m4pro/Library/Developer/Xcode/Archives/2026-10-05/FarqConstruction-1.4-12.xcarchive`.
- Archived JS/assets verified to match latest main mobile build exactly; assistant sprites included.
- `xcodebuild -exportArchive` to App Store Connect succeeded at22:02:35local: "Uploaded package is processing", "Upload succeeded", "EXPORT SUCCEEDED". Log `/tmp/ios-latest-upload.log`.
- Apple processing/TestFlight availability not verified; App Store Connect browser login unavailable. No public App Store review/release submitted; no supplier messages sent.
- Updated project opened in Xcode; local source remains preserved. Archive screenshot ios-1.4-build12.png (archive proof, CLI upload status not reflected in Organizer row).
