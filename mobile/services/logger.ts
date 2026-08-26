/**
 * Dev-only structured logging around the networking stack.
 * Enabled by default in development; force-disabled in production builds.
 * Never log credentials (TURN secrets etc.).
 */
const enabled =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process?.env?.NODE_ENV !== "production";

export function createLogger(scope: string) {
  const tag = `[${scope}]`;
  return {
    debug: (...args: unknown[]) => {
      if (!enabled) return;
      console.log(tag, ...args);
    },
    warn: (...args: unknown[]) => {
      if (!enabled) return;
      console.warn(tag, ...args);
    },
    error: (...args: unknown[]) => {
      // Errors stay visible even in production — but content is still scoped,
      // credential-free diagnostics only.
      console.error(tag, ...args);
    },
  };
}

export function describeIceServer(server: RTCIceServerLike): string {
  const urls = Array.isArray(server.urls) ? server.urls.join(",") : server.urls;
  return server.username ? `${urls} (auth: ${server.username})` : urls;
}

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}
