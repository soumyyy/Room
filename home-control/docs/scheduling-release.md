# Enable cloud schedules

Room schedules run on the cloud service in `scheduling-service`, without a home hub. Closing the iPhone app does not cancel a schedule. The service must be deployed and configured before the app can accept schedules.

## Prepare the service

1. Follow the deployment instructions in `scheduling-service/README.md`.
2. Deploy one worker with persistent storage and an HTTPS endpoint. Keep the worker running continuously.
3. Configure the Tuya account and device identifiers already used by Room. Keep credentials in the deployment's secret store.
4. Configure APNs credentials and the matching app bundle identifier for failure notifications.
5. Configure independent uptime monitoring. A stopped worker cannot report its own failure at the scheduled time.

Do not publish the scheduler access token, Tuya credentials, APNs signing key, or database. Use the scheduler token only with your own HTTPS endpoint.

## Connect the app

1. Set `scheduler.url` and `scheduler.token` in the ignored `home-control/secrets.json`, then run `npm run secrets` from `home-control`.
2. Build `ios/homecontrol.xcworkspace` for your physical iPhone with push-capable signing.
3. Long-press the clock to open **Schedules & Alerts**. The personal build connects automatically.
4. Enable notifications and verify that push registration succeeds.
5. Create a short fan or tube-light schedule and verify the action and history before relying on an overnight timer.

A notification permission problem does not cancel device execution. Failure history stays in the sheet, but notification presentation depends on permission, Focus, and connectivity.

## Validate Siri on the phone

Use the scheduling entry registered by the app and answer its prompts for action and time. Confirm the final spoken date/time. Verify create, list, and cancel on the phone, both unlocked and locked. Do not assume a direct sentence with multiple parameters works until it passes real voice testing. Existing immediate commands must continue to work.

Test a short schedule after closing the app and switching to cellular. Then test one six- or seven-hour AC-off schedule overnight. AC history reports that a command was sent, because the IR blaster cannot confirm physical appliance state.

## Check partial room actions

The current WiZ integration is local-network only. Without a verified WiZ cloud route, scheduled Enter/Leave can command cloud devices but cannot command the bulbs. The creation flow must disclose this limitation. A room occurrence must retain per-device results and report an incomplete outcome when bulb actions cannot run.

Test a failure notification with a controlled unavailable device. Verify that one failed scene step does not prevent other reachable steps. Check that scheduled Enter uses a valid saved restore state and does not invent settings when that state is missing.

## Release evidence

Record these checks before calling the feature ready for daily use:

- Service integration suite and existing app tests pass.
- Physical-device build installs with push-capable provisioning.
- Supported spoken phrases pass actual Siri testing.
- Schedules execute with the app closed and phone off home Wi-Fi.
- Cancellation prevents pending execution; running actions report that cancellation is too late.
- A service restart retains pending jobs and marks expired occurrences missed.
- Failure pushes arrive and history identifies each failed or unavailable device.
- Existing manual Enter/Leave and immediate Siri controls retain their behavior.

Local tests and a code-signing-disabled build do not establish deployment, APNs delivery, or actual Siri recognition.
