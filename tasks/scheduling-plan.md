# Room schedules and Siri implementation plan

Status: plan updated with user decision, 2026-11-18. Keep no home hub; cover AC, fan, tube light, and partial room scenes with failure notifications. No application changes or infrastructure deployment yet.

## Product behavior

Keep scheduling out of the main control flow. The agreed interaction is a long press on a button to open **Schedules & Alerts**. Earlier discussion named a small clock button, but that button does not exist in the current screen. Default implementation: add a subdued clock control with a normal touch target; long press opens the sheet. A short tap must never execute a device action. Expose an accessibility action that opens the sheet without requiring a hold. No badge count or banner. An optional small dot means upcoming items exist.

Keep the existing Enter/Leave long press for Diagnostics unless the user specifically chooses to reuse that button. Also link Diagnostics from the sheet's Recent activity area. Do not silently replace the current gesture.

The sheet lists upcoming actions and reminders by next run time. Show the action, absolute local date/time, relative time, and recurrence. Tap a row to edit, pause a repeating schedule, or cancel. Keep completed and failed runs under Recent activity. Include a small Add action so schedules do not depend on Siri.

Automatic actions execute device commands. Reminders deliver a notification and never execute a command. Notification permission denial must not prevent automatic actions. A reminder must clearly show permission problems and must not promise audible delivery through Focus or silent settings.

## Existing constraints

- `home-control/app/AppScreen.tsx`: Enter/Leave tap executes a scene; its 800 ms long press opens Diagnostics. There is no clock control today.
- `home-control/ios/RoomWidgetShared/RoomShortcuts.swift`: all ten App Shortcut registrations are in use. The source documents one interpolated parameter per phrase and AppEnum/AppEntity phrase parameters. Verify those constraints against the installed SDK before settling registration changes.
- `RoomIntents.swift`: native actions run without opening the app and share a controller with widgets.
- `RoomController.swift`: Enter/Leave use durable restore state, a scene lock, and per-device failure tracking. AC commands are serialized and spaced.
- WiZ bulbs use local UDP. AC, fan, and tube light use Tuya cloud. A cloud worker cannot use the current private bulb IP addresses.
- The user confirmed no always-on home hub. Scheduling must cover AC, fan, tube light, and Enter/Leave, with notifications for failed or unreachable devices.
- The phone App Group is not shared with a remote worker or home device.

## Execution architecture decision

Do not use a long-running iPhone timer, a Shortcuts Wait action, or background refresh as the automation executor. Apple controls background task launch timing. Local notifications can provide reminders, but do not provide reliable timed device execution.

Selected direction: cloud AC timers with no home hub. First verify whether Tuya provider-native schedules support this specific IR remote and account. If they do not, use a hosted durable scheduler that invokes the existing Tuya cloud API. Verify account permissions, deployment credentials, and hosting before implementation. Do not add a home service or rely on the Mac staying awake.

The release scope includes explicit AC, fan, and tube on/off actions by duration or exact date/time, Siri create/list/cancel, and the discreet schedules sheet. Enter/Leave schedules also belong in scope, with per-device execution and partial outcomes. Run reachable devices independently even if another device fails. Never report a complete scene when any requested device failed, is unsupported, or is unreachable.

Before accepting a room schedule, explain the known bulb limitation once in the creation flow: the current local UDP implementation has no cloud execution path. Investigate a supported WiZ cloud route without assuming access. If none is available, accept a room schedule only with clear disclosure that cloud devices will run and bulb actions cannot run. At execution time, record those bulb steps as unavailable and send a partial-failure notification. Do not silently omit them or wait for the phone to return home.
The backend owns schedules and run history. The app and Siri share a native schedule client and an App Group cache. Cache reads show last-sync age when offline; failed writes are not shown as confirmed schedules. Use server-assigned IDs, idempotent create requests, revisions for edits, and a stable occurrence ID for every run. Keep credentials out of schedule records and logs.

Required design for scheduled Enter/Leave: move or extract the scene state machine to the executor and make all scene-changing clients use that authority. A copied desktop client is insufficient: it lacks the phone's restore plan and scene coordination. Scheduled Leave captures the room state when it executes. Scheduled Enter restores the latest valid saved plan when it executes. Plan synchronization, manual scene actions, and partial retries must be proven before scheduled Enter/Leave ships. Preserve the current semantics: Enter restores devices that were on before Leave, rather than blindly turning everything on. Synchronize the phone's saved restore plan to the cloud authority, with revisions and a defined owner, before reporting a schedule ready. If no valid plan is available at execution, mark affected restoration steps unavailable and notify the user rather than inventing a restore state. A worker cannot read local bulb state at scheduled Leave without a verified cloud route; label cached values with their age and preserve unknown values. Existing device controls can stay direct only with an explicit reconciliation policy.

## Siri is an early feasibility gate

Implement and test the voice path before finishing the scheduling UI.

- Create: action plus either a duration or date/time. Offer a reliable conversational entry such as “Schedule Room”; Siri asks for missing values.
- List: speak the next few items and offer the sheet for the full list.
- Cancel: expose schedules as AppEntity values with stable IDs and clear names. Ask which schedule when more than one matches.
- Edit and recurrence can use follow-up prompts. Offer the same operations in Shortcuts even where automatic phrase registration is constrained.
- Confirm only after the executor durably accepts the schedule. Say the resolved date/time and timezone when relevant.
- Never reinterpret an unsupported delayed command as an immediate device action.

Desired direct utterances include “Turn off Room AC in six hours,” “Turn off Room AC in seven hours,” “Turn off Room AC at 6:30 PM,” “Turn off Room fan in two hours,” “Turn on Room tube light at 7 PM,” and “Leave Room at 9 AM.” These are acceptance targets, not guaranteed phrase grammar. Validate them on a physical iPhone. If direct multi-field speech fails, document the tested conversational sequence rather than claiming arbitrary natural-language support.

First try adding optional scheduling parameters to existing intent entry points without changing immediate behavior. Prototype metadata extraction and voice resolution. If dedicated slots are required, consolidate the two light power registrations into one and evaluate the remaining budget. Do not remove existing commands silently. List and cancel can initially use a single manage-schedules entry with a requested operation. Final registration layout depends on that prototype.

Choose an explicit authentication policy for every new intent. Test creation, listing, and cancellation while locked; do not inherit alwaysAllowed blindly for exposing schedule details. An unavailable scheduler produces an actionable spoken error, never a false confirmation.

## Schedule semantics

Persist ID, revision, action payload, schedule type, UTC next-run instant, source timezone, recurrence rule, enabled state, creation source, and timestamps. Keep occurrence records separate, with attempt times and per-device results.

- “In six hours” means elapsed time from accepted creation, converted to an absolute instant.
- A one-time local time resolves to a date before confirmation. Ask about missing AM/PM or unclear dates. Reject past dates rather than rolling them silently.
- Recurring local times follow the schedule's saved timezone, not the phone's travel timezone. Specify and test daylight-saving gaps and repeats before recurrence ships.
- Retry explicit on/off or set-value commands, never toggles. Bounded retries cannot guarantee exactly-once physical effects after a network timeout.
- Serialize conflicting commands per device. Cancellation succeeds only before an occurrence is claimed; otherwise explain that it is already running. Edits use revisions to reject stale writes.
- On restart, recover durable jobs. Proposed missed-run policy: execute automatic actions up to five minutes late, otherwise mark missed; obtain product agreement before shipping this policy. Do not run an old Enter scene hours late.
- Report AC “command sent” separately from measured state. Report partial room failures by device. Retry failed steps without erasing the saved restore plan.

Keep one active one-time AC-off timer as the default UI convenience. If a matching timer exists, ask whether to replace it or retain both. Never silently duplicate it after a retried Siri request. Manual device changes do not cancel a timer unless the user explicitly chooses that behavior.

## Delivery sequence

1. **Prove cloud execution and Siri.** Verify provider-native IR scheduling first; select hosted execution if unsupported. Resolve hosting, test an authenticated durable schedule round trip, and validate six/seven-hour and exact-time input on the phone. Test SDK shortcut limits. Exit: a short real AC-off schedule executes after the app closes, with honest history.
2. **Build the shared schedule service.** Add persistence, create/list/edit/cancel endpoints, occurrence claiming, bounded retry, crash recovery, and device adapters. Start with one-time AC off. Extend the native client and React Native bridge so Siri and UI use identical validation.
3. **Add the discreet sheet.** Implement the clock long press, accessible alternative, upcoming rows, Add/edit/cancel, offline state, and Recent activity. Preserve existing device controls and Diagnostics.
4. **Extend cloud device scheduling.** Add explicit fan and tube on/off and AC on/set actions through the same durable execution path. Preserve AC settings for AC-off commands. Verify each device with real short schedules and independent failures.
5. **Add scheduled Enter/Leave and failure notifications.** Prove scene-state synchronization and restoration, investigate WiZ cloud access, and execute every reachable scene step independently. Persist per-device results. Deliver a remote notification for failed, unavailable, missed, or partial actions even when the app is closed. Disclose known bulb limitations when scheduling; never claim total success for a partial scene.
6. **Add reminders and recurrence.** Start with one-time local reminders and daily/weekday rules. Reschedule local notifications after edits and cancellation. Use the remote notification delivery path below for automation failures; cloud execution cannot rely on the app waking to post a notification.

Proposed files are a native `RoomScheduleClient.swift`, intent/entity types beside `RoomIntents.swift`, bridge additions in `ios/homecontrol`, and `app/components/SchedulesSheet.tsx` plus schedule state handling. Select service and deployment files after the provider-native capability check. If native scheduling is sufficient, avoid building a separate execution worker; retain a shared schedule-management API where needed. Update native target membership and `scripts/check-native.mjs` for every new Swift source.

## Failure notifications are part of scene scheduling

Register device push tokens and notification permission in the app, send them to the authenticated schedule service, and use APNs from the server. Store credentials on the server. A provider-native timer is suitable only if its run outcomes can be observed; otherwise use hosted execution that records attempts and can report failure. A successfully created timer alone does not establish later execution success.

After bounded device attempts finish, send one notification per occurrence summarizing failures: “Leave Room incomplete: AC and fan commands sent; tube light failed; four bulbs unavailable.” Expand detail in Recent activity. A standalone failure says “Couldn't turn off the fan.” Include the scheduled time and link to that occurrence. Offer a deliberate Retry action in the app for failed steps; do not replay successful steps or send toggles. Deduplicate notifications by occurrence ID.

Target notification dispatch promptly after the result is known, within one minute of the scheduled time under normal network conditions. If retries continue, persist an in-progress result and send the failure summary when the retry deadline expires. Distinguish command acceptance from physical confirmation, especially for IR AC. A missed run also produces a notification once the service recovers.

Push delivery is best effort: Focus, permission denial, and device connectivity can delay or suppress presentation. Show permission state in the sheet and retain every failure in history. Add independent worker-health monitoring so an executor outage can be detected by another service; a dead worker cannot report its own missed jobs on time. Remote push and outage detection are required implementation work, not existing capabilities.

## Verification and release gates

Prefer integration and end-to-end tests with persistent storage and fake Tuya/WiZ devices. Exercise create through client, durable acceptance, execution, and observable run history. Cover duplicate requests, lost acknowledgements, cancellation races, edits, simultaneous manual commands, scheduler restart, missing network, expiry, partial scene retry, and timezone transitions.

Run `npm test` in `home-control` for type checks, native wiring, and existing controller/device coverage. Build the iOS workspace for a physical device. Do not run simulators or emulators on this Mac.

On the physical iPhone, verify the long-press gesture and accessibility action, no accidental device command, six/seven-hour voice input, exact dates, missing-time prompts, list/cancel disambiguation, and all existing immediate Siri actions. Test while locked, after app termination, on cellular, with notification permission denied, and with the executor unavailable. Test fan/tube failures, all bulbs unreachable, mixed scene results, missing restore state, duplicate pushes, and opening the failed occurrence from a notification. Use shortened timers for iteration plus one overnight six/seven-hour run. Record which exact utterances passed.

Completion requires verified execution with the phone absent, visible cancelled/missed/partial results, no regression in immediate actions or restore behavior, and a documented supported Siri phrase set. A build or fake-device test alone does not establish Siri reliability.

## Decisions still open

- Cloud execution: provider-native Tuya schedules if verified for this IR remote, otherwise a hosted durable worker. No home hub.
- Enter/Leave schedules are in scope with disclosed bulb limitations, preserved restore semantics, and per-device failure notifications. Full bulb execution depends on verified cloud access.
- Entry control: default is the discussed clock button; reusing Enter/Leave instead would require moving its current Diagnostics gesture.
- Final Siri registrations and direct phrase support: settle from the SDK and physical-device prototype.
- Missed-run grace period and locked-device privacy policy: proposed above, confirm during implementation design.

## Sources

Apple's [background execution guidance](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app) explains that the system chooses background launch time. Apple's [App Shortcuts overview](https://developer.apple.com/documentation/appintents/app-shortcuts) describes the Siri and Shortcuts integration surface. Registration constraints and existing behavior above come from this repository and still require installed-SDK and phone validation.
