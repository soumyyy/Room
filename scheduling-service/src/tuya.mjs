import { createHash, createHmac, randomUUID } from "node:crypto";

export function createTuya(env = process.env) {
  const config = {
    id: env.ROOM_TUYA_CLIENT_ID,
    secret: env.ROOM_TUYA_CLIENT_SECRET,
    base: env.ROOM_TUYA_API_BASE_URL,
    infrared: env.ROOM_TUYA_INFRARED_ID,
    remote: env.ROOM_TUYA_AC_REMOTE_ID,
    node: env.ROOM_TUYA_NODE_ID,
  };
  if (Object.values(config).some((value) => !value))
    throw new Error("Missing Tuya environment configuration");
  if (!config.base.startsWith("https://"))
    throw new Error("Tuya API URL must use HTTPS");
  let token = "",
    expires = 0;
  async function request(
    method,
    path,
    payload,
    authenticating = false,
    refreshed = false,
  ) {
    if (!authenticating && expires < Date.now() + 60000) {
      const result = await request(
        "GET",
        "/v1.0/token?grant_type=1",
        null,
        true,
      );
      token = result.access_token;
      expires = Date.now() + result.expire_time * 1000;
    }
    const body = payload ? JSON.stringify(payload) : "";
    const t = String(Date.now()),
      nonce = randomUUID().replaceAll("-", "");
    const access = authenticating ? "" : token;
    const toSign = [
      method,
      createHash("sha256").update(body).digest("hex"),
      "",
      path,
    ].join("\n");
    const sign = createHmac("sha256", config.secret)
      .update(config.id + access + t + nonce + toSign)
      .digest("hex")
      .toUpperCase();
    const response = await fetch(config.base.replace(/\/$/, "") + path, {
      method,
      headers: {
        client_id: config.id,
        t,
        nonce,
        sign_method: "HMAC-SHA256",
        sign,
        ...(access ? { access_token: access } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      if (
        !authenticating &&
        !refreshed &&
        ["1010", "1011"].includes(String(data.code))
      ) {
        expires = 0;
        return request(method, path, payload, false, true);
      }
      throw new Error(data.msg || `Tuya HTTP ${response.status}`);
    }
    return data.result;
  }
  const acPath = `/v2.0/infrareds/${config.infrared}/remotes/${config.remote}/ac/status`;
  async function read() {
    const [ac, node] = await Promise.allSettled([
      request("GET", acPath),
      request("GET", `/v1.0/devices/${config.node}`),
    ]);
    const snapshot = {};
    if (ac.status === "fulfilled") {
      const v = ac.value;
      snapshot.ac = {
        power:
          v.power_open === undefined ? Number(v.power) : Number(v.power_open),
        mode: Number(v.mode),
        temp: Number(v.temperature ?? v.temp),
        wind: Number(v.fan ?? v.wind),
      };
    }
    if (node.status === "fulfilled" && node.value.online !== false) {
      snapshot.node = {};
      for (const dp of node.value.status || []) {
        if (dp.code === "switch_1") snapshot.node.tube = dp.value;
        if (dp.code === "switch_2") snapshot.node.fan = dp.value;
      }
    }
    return snapshot;
  }
  return {
    read,
    async set(device, on, restore) {
      if (device === "ac") {
        const current = restore?.ac ?? (await read()).ac;
        if (
          !current ||
          ![0, 1, 2, 3, 4].includes(current.mode) ||
          !Number.isInteger(current.temp) ||
          current.temp < 16 ||
          current.temp > 30 ||
          ![0, 1, 2, 3].includes(current.wind)
        )
          throw new Error("AC settings unavailable; command not sent");
        await request(
          "POST",
          `/v2.0/infrareds/${config.infrared}/air-conditioners/${config.remote}/scenes/command`,
          { ...current, power: Number(on) },
        );
      } else {
        const accepted = await request(
          "POST",
          `/v1.0/devices/${config.node}/commands`,
          {
            commands: [
              { code: device === "fan" ? "switch_2" : "switch_1", value: on },
            ],
          },
        );
        if (accepted !== true)
          throw new Error("Switchboard command not accepted");
      }
    },
  };
}
