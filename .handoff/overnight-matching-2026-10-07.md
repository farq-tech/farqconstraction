# Overnight matching improvement — 7 October 2026

Deadline: 08:00 Riyadh. Automation automation-2 active. Never send supplier requests/messages or modify real requests. Automatic product images remain disabled.

## Baseline
Production speed PR1477 deployed: 12-line fixture 25 seconds vs 57 seconds, HTTP match 22.2 seconds; 68 targeted API tests pass. This is speed evidence, not proof that all suppliers are correct.

## Root findings 01:17 Riyadh
- UI autoPickConfident returned every candidate without using confidenceOf. Broad family/activity and similar-round suggestions were therefore auto-selected despite comments claiming exclusion.
- Upload summary used autoPickFor default cap 10, while proposals selected unlimited candidates: counts could differ (observed 113 vs 712).
- confidenceOf checked previous quote/learned before outOfCity, allowing historical evidence to bypass geographic review.
- priorQuotes loses API prior_quoter.match (SPEC, LINE_TEXT, CATEGORY): category-only quotes currently look exact. Must audit and carry provenance before declaring product confirmation.

## Work in progress, NOT deployed
UI branch codex/confirmed-supplier-selection based origin/main 51b307c. Three tracked files edited:
- autoPickConfident filters MAYBE, keeps all SURE/LIKELY with no channel cap.
- confidenceOf outOfCity gate first; round PRICED/ANSWERED retained, SIMILAR stays review-only.
- Upload uses same unlimited autoPickConfident as Proposals.
- Existing regression expectation corrected to exclude broad/activity/out-of-city/similar candidates.
15 autoPick tests pass; Vite build passes, existing chunk/import warnings.

## Next
Add meaningful count (>10) and out-of-city history regression tests. Audit API prior_quoter.match and round proof mapping; retain candidates for manual review without auto-confirming broad category evidence. Run relevant full UI tests, create/attach PR, review exact-head checks before merge and verify production. Continue fixed diverse family positive/negative evaluation and supplier evidence coverage. Audit waterstop versus floor/ceramic joints; upload 12-family PDF through review-send only and compare counts, no final send. Preserve all preexisting untracked files.

## 01:31 Riyadh
UI commit 361673a, PR35 created and attached: https://github.com/farq-tech/farqconstraction/pull/35 . Await exact-head checks/review before merge. 17 selection tests pass; full suite 1893 pass / 1 fail, pre-existing priceReview/homeOverview failure reproduced on clean origin/main. Vite build passed. Do not claim deployed yet. Next audit prior quote match provenance and family evidence.

## 01:46 Riyadh
PR35 review identified strong duplicate evidence hidden by weaker early lane, buyer-choice lane without redundant learned flag, and misleading no-supplier label. All three corrected in cf3db28 pushed same PR. 19 selection tests pass, build passes. Stronger evidence is selected across all copies while preserving supplier ranking order, buyer choices recognized, broad candidates remain reviewable. Await NEW exact-head checks/review; old checks belong 361673a. Do not merge until new review complete.

## 02:02 Riyadh
PR35 second review caught same-record weak historical outcome overriding independent product proof. Fixed bae5438, 20 selection tests pass. The previous duplicate and learned-lane findings covered by regressions. Upload label now says lines needing supplier review, not absent suppliers. Await exact bae5438 review/checks.

Initial offline server resolver evaluation: 30 English family fixtures; 29/30 have a family, 25/30 have an intent (4 family-only, one wholly unresolved). No actual supplier proof evaluated yet. Novel gap: Polyurethane waterproof coating unresolved; Chemical anchor resin wrongly resolves mechanical_anchor. HDPE drainage pipe 110mm, galvanized HVAC duct 0.8mm and anchor bolt M16x200mm family-only. CPVC fire sprinkler pipe resolves fire_sprinkler (sprinkler head intent versus pipe) and needs audit. These are root ontology problems; fix paired UI/source/API ontology bundle together, never hand-edit generated bundle independently. Search ontology source chemical_anchor/mechanical_anchor/polyurethane and review appropriate semantics/tests next.

## 02:16 Riyadh
PR35 review found mobile NewRequestScreen still used unfiltered capped selection. Fixed acc70d2, shared autoPickConfident now used web upload, proposals and mobile. 36 targeted selection/send-guard tests pass; build passes. Await exact acc70d2 checks/review, then merge. No suppliers contacted.

## 02:31 Riyadh
PR35 review caught outcomeSuggestion omitted from mobile manual picker; added it so weak historical candidates remain available. Proposal summary no longer claims review-only lines have no suppliers and no longer claims broad activity candidates selected. 36 selection/send tests + build pass. Await new head checks. Repeated old review comments have moved commit_id forward but source wording and mobile call already fixed; assess actual source. Next merge if latest actual findings addressed.

## 02:47 Riyadh
Latest PR35 all checks passed but new actual review finding: matching lacks current delivery city, mobile city can change at details after automatic selection. Do not merge until handled. Most other comments are stale actual source already corrected. Need carry city through matchSuppliersForItems opts -> matchViaFarqBoqApi body -> matchConstructionBoqCatalog POST, verify API city key handling; mobile must enter city before matching and if later changes rematch/review, preserving manual choices safely. Avoid silently clearing buyer choices. API runtime city field inspect next.

## 03:02 Riyadh
City root fix: API new branch codex/request-delivery-city-match, explicit body.delivery_city overrides profile default (bounded string), malformed/missing falls back. 19 runtime tests pass. UI matching option now carries deliveryCity -> client POST. Mobile city entered before matching, details shows city with button back to items to change/re-match; no silent late city edits. 30 relevant UI tests + build pass. Must create/attach API PR, deploy API first, then merge UI35 after latest review. Current API parent origin/main61e4955b5.

## 03:16 Riyadh
API PR1482 merged dc6f0e27da449a29d8d7fa963f8733cda1592ab3. Railway deployment 3d8cfeeb-d378-4db7-aeab-f33ed6fe5878 BUILDING; /version still791650, verify next heartbeat before merging UI city support. UI21 autoPick tests pass; 837466f fixes restrictive outOfCity evidence across duplicates, awaiting new checks. API now clean branch codex/waterproofing-family-vocabulary from latest origin/main ready for next family work, do not edit generated resolver manually. Existing UI branch stillPR35; don't overwrite or mix ontology changes until merge.

## 03:32 Riyadh
API1482 production /version dc6f0e27 and Railway SUCCESS verified. UIPR35 review837466f: old comments remain stale; new actual issues desktop needs deliveryCity pipeline (parseBoqFile and incremental Upload matching omit city) and SendModal allows later changes; mobile city input must freeze while busy. Mobile freeze edited locally (uncommitted). Next implement session matching city/upload city before extraction/SendModal rematch or prevent late edit, with clear ability to return change/review, then test+push35. Avoid over-restricting supplier coverage: out-of-city stays manual option; actual geography must match destination. No merge35 yet.

## 03:47 Riyadh
Local UNCOMMITTED desktop city pipeline changes (build passes): SessionState matchingCity + setter, Upload city input before read (freeze while continuing), opts deliveryCity through parseBoqFileInner initial and incremental matching, SendModal defaults matched city and readOnly with helper return/rematch. Mobile city disabled while busy. NEED REVIEW before commit: when city changes invalidate only prior AUTOMATIC selections, preserve manual choices; mergeMatched may retain old supplier fields, inspect and test. Existing restored drafts no matchingCity SendModal remains editable; mark geography unknown/review rather than assert correct. Add regressions for city payload/client and draft persistence. PR35 still837466f latest published; API1482 live.

## 04:02 Riyadh
Desktop city pipeline completed. Session matchingCity persisted; changing city invalidates only automatic selections and marks lines needsMatch, preserving manual choices. mergeMatched now refreshes outcomeSuggestion/exposureId and automatic ID list to avoid stale history from old city. SendModal city readOnly when known matched-city (helper return/rematch); legacy no-city drafts unchanged. 42 selection/cart/isolation tests pass, build passes. Typecheck run inspect output; latest pushed PR35 requires exact-head review. Still no live user journey test; family vocabulary improvement not started beyond audit.
Typecheck npx tsc --noEmit passed. Head7113033.

## 04:17 Riyadh
Review7113033 two real issues fixed: Upload re-reads cart AFTER city invalidation; mergeMatched accepts retainedSelections preserving visible manual supplier records and refreshing outcomes/exposure IDs. New manual-record regression plus43 relevant tests pass, typecheck pass. Await new checks35. API city patch live.

Ontology audit confirms existing intents permit bounded corrections without new IDs: liquid_waterproofing, hdpe_pipe, galvanized_ductwork, mechanical_anchor; chemical anchor resin belongs existing concrete_admixtures/anchoring_epoxy (currently chemical/resin strong terms incorrectly in mechanical_anchor). Use these existing IDs with precise compound aliases and negative conflicts, preserve family-only ambiguous items. UI head81e8e15.

## 04:32 Riyadh
PR35 head7702b10 fixes restored-city async hydration and empty city guards in upload read/continue/mobile.43 tests+typecheck pass. Need latest review and merge soon to leave time for family vocabulary improvements. API ontology now cpo-v22 (other main changes), sync same-version mutation rejects by ledger, next vocabulary must bump cpo-v23 and paired fixture, resolver, provenance. Do not blindly reuse old cpo-v21 assumptions.

## 04:47 Riyadh
PR35 review7702b10 fixed: city hydration no longer strips typed multiword spaces; mobile rematch now tracks automaticSelections ref and preserves manual selected IDs+known records, includes retained manual records visibly in each line.43 tests+typecheck pass. Current pushedheadinspect. Need merge35 after review; then source ontology family fixes cpo23 paired API/UI. No claim of live UI yet.

## 05:02 Riyadh
PR35 ef7cc56 home/inflight upload now queues file and offers city-confirmed read button before processing. Explicit reselect clears automatic marker on web/mobile to preserve manual selections across city changes.43tests+typecheck pass. Next latest review merge/deploy then live fixture. API proposed cpo23 file prepared offline, 4 existing intent aliases; no family patch applied yet.

API cpo23 payload now locally synced from proposed JSON and resolver mechanically bundled from UI resolver. Uncommitted 4 generated data/ledger/fixture/resolver files on codex/waterproofing-family-vocabulary. Validate 4 gap outcomes, update EXPECTED_VERSION and meaningful family regression tests, then API PR paired UI source PR after35merge. Never deploy API/UI unsynchronized and claim consistency.

## 05:17 Riyadh
UI5bc5616 fixes retained auto candidates on material edits, rejected candidates filtered fresh+retained, bulk reselection clears auto markers;44 tests+typecheck pass. Await35review. API cpo23 generated; added8 family vocabulary fixtures and vendored expected version23; tests currentlyrunning46570 inspect. Need sourceUIpayload same bytes and provenance beforepublish.

## 05:33 Riyadh
UIPR35 b8b9dfb blocks legacy unmatched-city sends and directs legacy drafts to upload. Typecheck pass. API cpo23 50 tests pass (8 precise vocabulary+6vendored+19mapruntime+17ranking); commit/push in progress. NeedAPI PR create/attach with note pairedUI source pending, do not merge untilpairedUI ready. 4 resolved gaps verified; no new intent IDs and no broad keyword expansion.

## 05:47 Riyadh
UI35 latest2f33803 blocks pending needsMatch sends and legacy route, awaiting review. Switched UI branch codex/precise-family-vocabulary fromoriginmain independent of35; copied EXACT API cpo23 payload, added6 positive/control family tests, updatedversion expectation.1224 family/ontology tests pass, buildpass. API1486 attached reviewedallchecks pass; create/attach UI36 thenmergepairedsource+API ifnofindings. UI35 stillmustmerge latestheadseparately.

## 06:02 Riyadh
UI35 merged after clean latest exact-head review; getmergeSHA fromgh result next andverifyproduction. Vocabulary36/1486 review correctly found HDPE generic drainage ambiguity and unguarded ductaliases; removed newHDPE aliases (leavefamily-only), guarded ductaliases againstflexible/accessory and bumped immutable version24. No overwrite cpo23 ledger. UI1227ontology/familytests pass, API17vocab/vendored pass (+runtime/rank priorpassed). HeadsUI9970e29 APIe020c263e, new reviews required beforemerge. Final scope THREE newlyrecognized productdescriptions, notfour; preservecorrugated/twin-wall/flexible/accessory pools. Must rewrite PRdescriptions tofinalscope viaREST beforemerge. No suppliermessages.

## 06:18 Riyadh
UI35 merged864b2ba1a0a2e94d42f5ecbf573f050849b5066d production Vercel success verified. UI36 and API1486 latest exact-head review passed with no new findings, descriptions rewritten final THREE products/guardedHDPEscope, both merged. NeedexactmergeSHAs anddeployverification next. Browser CUA reset: Chrome wasclosed/crashed overnight and openedprofilepicker; farq profile opensconstruction login page (noauth), IAB hasZEROtabs. No logged session for liveupload presently; don'tclaim journeyverified. Can try previouslyknown Chrome farq.sa/work profile viaUI existingprofiles or savedautofill (neverextractcredentials), otherwisereadonly production runtime12fixture and note UIauthlimitation. NeedAPIcpo24verifylive beforeprofiletests.

## 06:32 Riyadh
API1486 production caaf8da319781cd1e9812998c9a4313bc39b98be verified /version build749355ad. UI36 production2dc595ff Vercelsuccess;35production864b verified. Readonly production-container12family probe ongoing session34853 with stricttransactionreadonly (saved persistenthelper underAPI.handoff/catalog-source-recovery/overnight-family-probe.cjs; /tmphelpers lost aftermachine reboot). Probe uses actual account viaknownRFQ read only, basecatalog+map only (NOTfullUI/exposure/AIchain). Results mustlabel accordingly. Browserlogin stillunavailable currentfarqprofile; IABzero tabs.

## 06:34 Riyadh
Production read-only base catalogue/map probe completed: cpo-v24, 12 families, 15,583 ms. All 12 have candidate lists, but only 8 have NAME/ACTIVITY evidence; waterproof coating, geotextile, cable glands and MDF currently have only broad/sibling evidence and must remain review candidates, not claimed confirmed sellers. Saved actual JSON in API .handoff/catalog-source-recovery/overnight-family-probe-result.json. This is not full authenticated UI journey.
New root issue confirmed: client discarded prior_quoter.match, so CATEGORY historical quotes upgraded to material-level SURE. Bounded local branch codex/prior-quote-evidence from latest main now allows quote-count upgrade only SPEC/LINE_TEXT, leaving category candidates and their independent evidence available. 30 tests passed (9 provenance +21 selection), typecheck checked. Not yet committed/PR/deployed; next run finish build/review/publish. No supplier contact or real-request changes.

## 06:46 Riyadh
Historical quote confidence fix committed611cc88, PR37 created and attached https://github.com/farq-tech/farqconstraction/pull/37 . 30 tests+typecheck+build passed; waiting exact-head CI/review before merge. API exposure confidence independently still upgrades CATEGORY and checks out_of_city too late; this affects recorded metrics, needs paired bounded fix next, not yet changed. Preserve true history in storage, only restrict confidence upgrade.

## 07:03 Riyadh
UI37 exact-head611cc88 review and preview checks passed, merged; verify production next. API paired metrics fix874b1287d now records CATEGORY history as background only and applies city guard before historical/learned/round evidence; preserves historical metadata and independent material proof. Six exposure tests pass including isolated PGlite write/rollback. API PR creation pending session63725; attach returned PR and inspect exact-head checks before merge. No production data changes or supplier contact.

## 07:17 Riyadh
UI37 production71ce90cb4de4a837527822cb48e8f8a9f1131256 Vercel success verified. API1488 reviewed exact874b1287d with CodeRabbit and Vercel Agent checks passed, merged264df716dc5b4e017cc6be1f3905812ef5138e1e; production stillcaaf8da at read, deployment verification pending. Current combined API run48/48 runtime+ranking+vendored+exposure tests pass. Corrected report counts: no new real seller evidence added for four weak families; do not equate suggested candidates with confirmed stock. Authenticated browser journey remains blocked by logged-out session, no sends attempted.

## 07:33 Riyadh
API1488 production264df716dc5b4e017cc6be1f3905812ef5138e1e verified /version build97001a84. Expanded44 API attribute/brand/family tests initially43pass1fail: RULE_GENERATION remained21 despite synchronizedv24 payload/resolver/fixture. Corrected declaration after behavior conformance passed; rerun44/44passed. UI29 spec-card/brand/attribute tests passed. API newcommit3101ecd0e generation-declaration-only PR creation session79290 pending; review thenmerge ifpasses. No runtime rules changed by this final correction.

## 07:47 Riyadh
API1490 exact-head3101ecd0e Vercel review passed, no new comments; CodeRabbit rate-limited (not substantive review). Manual conformance and92 combined API regressions all passed. Mergedf370aba66ec477615a7d336438ae9999c84e25a6, deployment pending (/versionstill264df716). Evidence fileAPI.handoff/catalog-source-recovery/final-targeted-tests.txt. Browser fresh checkChrome construction shows LOGIN page; IABempty. Cannot truthfully claim authenticated upload-to-send-review validation completed after deployments. Keep this limitation in morning report. New UI final targeted59tests run captured separately. No user credentials requested overnight.

## 08:00 Riyadh — final verification
API final production f370aba66ec477615a7d336438ae9999c84e25a6 confirmed /version, buildf13ad6ff-01cd-4636-b53c-2fee120c6062. UI production71ce90cb verified previously. Final targeted92API+59UI tests passed;1227ontology/family UI tests previouslypassed. No claim fullsuitegreen (knownbaselinepriceReview failure). Twelve-family productionreadonly probe15.583sec;8have name/activity evidence,4weak-only gaps remain. No stock confirmation inferred. Authenticated final UI journey could not complete because Chrome loggedout; no real requests changed/no messages sent. Images remain disabled. Automation2 deleted via supported app tool at08:00 perinstruction; overnight follow-up stopped.

## Continued after user authorization
Automation2 restarted for autonomous bounded continuation; no morning deadline now, quiet except meaningful results. Readonly production evidence audit15.189seconds savedAPI.handoff/catalog-source-recovery/family-evidence-audit.json. Confirmed weak-family candidate pools contain related trades/service businesses, not hidden proof; MDF includes wood-decor/wood-substitute dealers, cablegland includes cabletray manufacturers. Do NOT upgrade these by family alone. Source ontology also still misassigns chemical anchor/resin to mechanical_anchor rather than existing anchoring_epoxy; next paired version change must remove precise chemical terms from mechanical and add guarded epoxy aliases, regenerateAPI+UI source and fixtures, meaningful negativecontrols. No code edits this continuation yet. API currentbranchcodex/ontology-generation-conformance cleantracked, UIcodex/prior-quote-evidence cleantracked.

## Chemical anchoring root fix continuation
Pairedcpo-v25 sourceUI6df89b3/API597f66ac2 moves precise chemical anchor resin/adhesive compounds into existing anchoring_epoxy/concrete_admixtures and removes chemical vocabulary from mechanical_anchor. Mechanical wedge/bolt anchors unchanged. 1233UIontology/family tests+typecheck+buildpass;31APIvocab/conformance/vendoredpass. PRscreatedpendingreview; require exactheadcheck beforemerge paired API/UI. No deployedclaimyet. Generic chemical anchor may remain unresolved rather than misroute; do not assume adhesive without explicit compound. Next audit bareArabic انكر crossing whenchemical adjectivespresent and supplierfamilysource_evidence gaps; no suppliermessages.

## 08:46 Riyadh heartbeat
PR38 review pending, previews success. PR1492 review/CodeRabbit pending; Vercel checkFAIL Account is blocked (external account deployment restriction). Do not merge or bypass check. User must resolve Vercel account block if persists; Railway API production unaffected by current unmergedchanges. Existingfasteners termguard alreadyblocksbareArabicانكرwithchemical/epoxy/resin, so no speculative duplicateguard needed. Continue local tests/data evidence whileblocked; no sendactions.

## User-requested continuation — resin alias review fix
Vercel account failure no longer present: API1492 preview nowpassed (reviewpreviousheadpending). UI38 review identified bareResinanchor lostrecognition; fixed paired immutablecpo-v26: existinganchoring_epoxyincludesresinanchor, guardedchemicalArabicexistingfastenersguardretained. UI0114d44/API0de12c522 pushedsamePRs; requirelatestheadreview beforemerge. UI1234tests+typecheck+buildpass;API32tests pass. No new IDs or supplierdata claims; no messages/requestchanges. Next verifyreviewPR38/1492,mergeonlyafterlatestchecks; thenproductionversionand readonlyresolvercontrols.

## 09:00 Riyadh heartbeat
LatestUI38 reviewpending; previous resin alias commentfixed0114d44. API1492 latestVercelpreviewagainFAILAccountblocked; no bypass/merge. Began primarysupplierwebproof gapresearch: TexoFibmanufacturerandDurarMasaghgeotextile; KELLandGulfMEPexactM20cableglandproductpages. SavedcandidateURLs/snippets in API.handoff/catalog-source-recovery/web-family-evidence-candidates.json. ThesearewebcandidatesNOTlinkedtoDB/notstockproof/notyetimported. NextreadonlyDBidentity/domainmatching andinspect existingverifiedwebsiteevidence ingestion schema; do notguess IDs or bulkupdate. Blockalreadyreporteduser, no redundantalert.

## Authenticated production UI journey after user login
ChromeWork nowloggedinadmin@aldafe.com (userenteredlogin). Uploadedexistingfarq-family-speed-qa.pdf fromcatalog-speed-check viaUI; explicitRiyadhconfirmed.12lines extracted in28sec, quantitiesunitscomplete, structuredtechnicalspecs12/12timedout (fallbacknamequantity). Uploadsummary681uniqueselected,10selectedlines2review. Proposalsfooter681unique/688per-line matchedsamecount; openedSendModalreview screenshot681suppliers10lines2pending. NOFINALsendorRFQcreation. Newvisibleissues: uploadcards say بلا مورد for11lines despite suggestions; proposalsselectedsomeFAMILY evidence examplesAlRaqiceramics expansionjoint onPVCwaterstop, potentialduplicate strong evidence/roundlane mustaudit notassumeconfirmedstock. Sendreviewpendinglabel sayssearchongoingthoughprocessingcompleted; misleading. Need fixdisplaycounts andpendinglabel next boundedUIbranch afterchemicalPRreview; inspectselectedprovenance beforeclearingmanualchoices. CurrentChromeleftSendModalreviewopenforuser; no messages.

## Upload/send status fix PR39
Boundedbranchcodex/upload-review-status fixes CartPanel candidatecount viaautoPickForInfinity(unique,rejectedfiltered,alllanes), labelssuggestionsnotstock; no-candidate saysneedsreview. Sendreviewdoesnotpromisebackgroundsearch/laterautomaticdelivery. Specwarninghonestlystatesmissingdetail,noinventedtimeoutcause. ExtractionlatencyNOTfixedbythispatch.23render/carttestspass; TypeScriptfixturecorrectedfollowup66497(recheckresult);buildpassed. PR39attachedhttps://github.com/farq-tech/farqconstraction/pull/39. Awaitexactheadreviewbeforemerge/deploy; nextrootparseworkseparate. ChemicalPR38/API1492stillreviewpending; avoidmixingbranches. ProductiontestdraftChromeSendModalopen,no sends.

## 09:15 review followup
LatestUI38review identified familyfastenersstillchemicalanchor plus Arabicbarealiasloss. Correctedsourcecpo-v27,movechemicalanchor/كيميكالانكر/انكركيميكالtoexistinganchoringepoxy andremovefamilychemicalanchor. UI44fa3d7/API da50de93f pushedsamePRs;33UIfamily tests35APIvocab/conformance/vendored pass. NeedrerunfullUIontologytest1237andtypecheck/buildnewheadbeforemerge afterreview. PR39otherbranchfixpendingreview; do not losebranch39changes. ParseAPIjobpollcontinues14minutesdespiteparseBoq6secrace cutoff; latencyrootcouldstopunnecessaryserverextractforcomplete table withdimensionsalreadyinname, but donotclaimalltechnicalspecs known. Need meaningful parsingcancellation/enrichmentdesign next.

## 09:17 heartbeat
Fullcpo27UI1237ontology/family tests+typecheck+build pass. PR39review caught omissionwarningcountstillstatusbased; fixedSendModalunselectedItemsfromactualselectedByItem andworkOnlyexclusion (readyclearedlinesincluded).Typecheck+23carttests pass/session18989pushinspect. ChemicalPR38/1492 latestreviewstillneedsverification, no mergeyet. Reviewcycleactivecontinuewithoutnotification.
