import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

export function createAPNs(env = process.env) {
  const configured = Boolean(
    env.ROOM_APNS_KEY_FILE &&
    env.ROOM_APNS_KEY_ID &&
    env.ROOM_APNS_TEAM_ID &&
    env.ROOM_APNS_TOPIC,
  );
  return {
    configured,
    async send(device, schedule) {
      if (!configured) throw new Error("Push delivery is not configured");
      const header = Buffer.from(
        JSON.stringify({ alg: "ES256", kid: env.ROOM_APNS_KEY_ID }),
      ).toString("base64url");
      const claim = Buffer.from(
        JSON.stringify({
          iss: env.ROOM_APNS_TEAM_ID,
          iat: Math.floor(Date.now() / 1000),
        }),
      ).toString("base64url");
      const unsigned = `${header}.${claim}`;
      const signature = sign("sha256", Buffer.from(unsigned), {
        key: createPrivateKey(readFileSync(env.ROOM_APNS_KEY_FILE)),
        dsaEncoding: "ieee-p1363",
      }).toString("base64url");
      const failures = (schedule.results || [])
        .filter((r) => r.status !== "command_sent")
        .map((r) => `${r.device}: ${r.error || r.status}`)
        .join("; ");
      const body = JSON.stringify({
        aps: {
          alert: {
            title: schedule.title,
            body:
              schedule.action === "reminder"
                ? schedule.message || "Your Room reminder is due."
                : schedule.status === "missed"
                  ? "This scheduled action was missed."
                  : `Action incomplete. ${failures}`,
          },
          sound: "default",
          "thread-id": "room-schedules",
        },
        scheduleId: schedule.id,
      });
      await new Promise((resolve, reject) => {
        const session = connect(
          device.environment === "sandbox"
            ? "https://api.sandbox.push.apple.com"
            : "https://api.push.apple.com",
        );
        let settled = false;
        const timeout = setTimeout(
          () => finish(new Error("APNs connection timeout")),
          10000,
        );
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          session.destroy();
          error ? reject(error) : resolve();
        };
        session.on("error", finish);
        const req = session.request({
          ":method": "POST",
          ":path": `/3/device/${device.token}`,
          authorization: `bearer ${unsigned}.${signature}`,
          "apns-topic": env.ROOM_APNS_TOPIC,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-collapse-id": schedule.id,
        });
        let status;
        req.on("response", (headers) => (status = headers[":status"]));
        req.on("data", () => {});
        req.on("end", () =>
          finish(status === 200 ? null : new Error(`APNs HTTP ${status}`)),
        );
        req.on("error", finish);
        req.setTimeout(10000, () => req.destroy(new Error("APNs timeout")));
        req.end(body);
      });
    },
  };
}
