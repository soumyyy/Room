# Room scheduling service

Runs AC, fan, tube light, and partial Enter/Leave schedules through Tuya cloud without a home hub. The iPhone submits durable jobs and can close or leave home afterward. No production deployment is performed by this change.

Use Node 22.13 or later. The service uses built-in SQLite (experimental in Node 22) and has no runtime package dependencies. Run `npm test` for HTTP integration, restart recovery, device adapter, and recurrence checks.

## Deploy

1. Copy `.env.example` to `.env` and supply the Tuya project configuration. Use the same Tuya account/project as Room. Set `ROOM_TUYA_NODE_ID` from `home-control/devices.json`.
2. Generate a private random `ROOM_SCHEDULER_TOKEN` with at least 24 characters. Configure that token and the public HTTPS URL in the iPhone's Schedules sheet. Never place the token in a URL.
3. Supply an APNs signing key file and its key/team IDs and app topic. Push alerts require the app's provisioning profile to allow APNs and the phone to grant notification permission. Without APNs, jobs still run and history records failures, but closed-app alerts cannot be delivered.
4. Run `npm start`, or copy `compose.example.yml` to a deployment compose file and use Docker Compose. Mount the SQLite directory on durable storage. The example binds the host port to loopback so a TLS reverse proxy can expose the API. The example APNs file mount must exist; remove it for initial execution-only setup.
5. Configure an independent external health monitor to call authenticated `GET /health`. Alert if the endpoint is unavailable or `lastTick` is older than one minute. A stopped server cannot notify about its own outage. The health endpoint exposes `busy` while commands are in progress.

Run one service process per SQLite database. Horizontal worker coordination is not implemented. Keep the service on persistent compute, not request-only serverless hosting. Back up the SQLite database with a SQLite-aware backup while live, or stop the service before copying its files. Use HTTPS at the reverse proxy and keep `.env` and `.p8` files private.

Tuya's [IR cloud overview](https://developer.tuya.com/en/docs/cloud/ir-control-hub-open-service?id=Kb3oe2mk8ya72) lists native timers. Support for this account and IR remote has not been verified. Hosted execution is used here to support consistent fan/tube/scenes and observable per-device outcomes and failure alerts.

## API

All routes require `Authorization: Bearer <ROOM_SCHEDULER_TOKEN>`. Errors return `{error:string}`. The body limit is 64 KiB. This is a single-room service: the token grants access to all schedules and registered push devices.

- `GET /v1/schedules` returns `{schedules,capabilities}`. Schedules contain upcoming and recent history. Capabilities report `cloudDevices`, `bulbs:false`, and `pushConfigured`.
- `POST /v1/schedules` accepts `{requestId,action,runAt,timeZone,recurrence?,acknowledgePartialScene?,restore?,message?}`. `requestId` is a stable retry key, also accepted as the `Idempotency-Key` header. A retried create returns the original schedule. Action is `acOff`, `acOn`, `fanOff`, `fanOn`, `tubeOff`, `tubeOn`, `enter`, `leave`, or `reminder`. `runAt` is a future ISO instant within one year; `timeZone` is an IANA timezone. Recurrence is `none`, `daily`, or `weekdays`.
- `PATCH /v1/schedules/:id` accepts `{runAt,revision}` to move a pending occurrence. A stale revision or already running/finished job returns 409.
- `DELETE /v1/schedules/:id` cancels a pending occurrence. Running or finished jobs return 409. Cancel the next pending occurrence to stop its recurring series.
- `PUT /v1/push-tokens` accepts `{token,environment:"sandbox"|"production"}`. Failure notifications go to registered devices; APNs environment must match the installed build.
- `PUT /v1/scene-state` accepts `{snapshot,restore?,revision?}`. It updates the phone's observed state and preserves an active cloud Leave restore plan. A supplied stale revision returns 409.

Schedules contain `id`, `title`, `action`, `runAt`, `timeZone`, `status`, `revision`, `createdAt`, optional recurrence and optional `results`. Results identify `device`, `status` (`command_sent`, `failed`, or `unavailable`), and optional `error`. Schedule status is `scheduled`, `running`, `completed`, `partial`, `failed`, `missed`, or `cancelled`.

## Execution behavior

The worker checks durable jobs every second, performs explicit state commands, and retries each failed device at most three times. Jobs over five minutes late become missed. A restart resumes unfinished explicit commands and retains completed steps. Exactly-once physical execution cannot be guaranteed if a Tuya response is lost after accepting a command. Jobs serialize in one worker to avoid conflicting sends. AC off reads current cloud settings at execution rather than reverting temperature/mode to schedule-creation values.

Daily and weekday schedules retain their timezone and local clock time. A nonexistent daylight-saving time is skipped; a repeated time runs once at the first instance. Completed occurrences stay in history, and the next future occurrence gets its own ID. After downtime, overdue occurrences are missed and the next future occurrence is scheduled.

Enter/Leave requires `acknowledgePartialScene:true`. The worker independently attempts cloud devices. WiZ bulbs currently have no cloud adapter, so every room occurrence records bulbs unavailable and sends a partial/failure alert. Enter restores only devices enabled in the saved restore state; unknown states remain unavailable. Leave refreshes cloud state before saving the restore plan, and repeated Leave keeps the previous plan. An absent/failed cloud read cannot prevent fan/tube/AC off attempts.

APNs sends one failure summary per occurrence and registered token, with up to five delivery attempts. Reminders use the same alert path. Notification history remains available when APNs is unconfigured or delivery fails. Physical appliance confirmation is unavailable for IR AC; `command_sent` means the cloud accepted a command. Focus, permission denial, and connectivity can delay notification display.

Not yet supported: cloud WiZ control, provider-native timer synchronization, distributed workers, app-driven retry of only failed scene steps, push-token revocation, and changing recurrence rules in place. A user can cancel and recreate a schedule for a different rule. Do not report the deployment ready until live Tuya commands, APNs delivery, Siri phrases, and phone-closed execution have been tested on the target server and phone.
