/**
 * ICE server configuration from environment variables (never hardcoded).
 *
 * EXPO_PUBLIC_STUN_URL / EXPO_PUBLIC_TURN_URL / EXPO_PUBLIC_TURN_USERNAME /
 * EXPO_PUBLIC_TURN_CREDENTIAL  (see .env.example)
 *
 * SECURITY: TURN credentials shipped in Expo public env vars are readable by
 * anyone with the app binary. For production, issue short-lived
 * time-limited credentials via the signaling Worker (Cloudflare TURN REST
 * API) instead of static secrets. Documented in docs/serverless-webrtc.md.
 */
import type { RTCIceServerLike } from "./logger";

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function splitUrls(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [];

  const stun = splitUrls(process.env.EXPO_PUBLIC_STUN_URL);
  if (stun.length > 0) servers.push({ urls: stun });

  const turn = splitUrls(process.env.EXPO_PUBLIC_TURN_URL);
  if (turn.length > 0) {
    servers.push({
      urls: turn,
      username: process.env.EXPO_PUBLIC_TURN_USERNAME || undefined,
      credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL || undefined,
    });
  }

  return servers;
}
