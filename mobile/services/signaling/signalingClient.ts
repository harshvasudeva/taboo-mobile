/**
 * Typed wrapper around the Cloudflare signaling WebSocket.
 * Signaling ONLY — this client never sees game messages.
 */
import { createLogger } from "../logger";
import type {
  SignalClientMessage,
  SignalServerMessage,
} from "@shared/networking/protocol";
import type { PlayerId } from "@shared/types/player";

const log = createLogger("Signaling");

export type SignalingStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

interface SignalingClientOptions {
  url: string;
  onStatus: (status: SignalingStatus) => void;
}

export class SignalingClient {
  /** Mutable message sink so consumers can subscribe before connecting. */
  onMessage: (msg: SignalServerMessage) => void = () => {};

  private ws: WebSocket | null = null;
  private status: SignalingStatus = "idle";
  private intentionalClose = false;
  private retryAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: SignalingClientOptions) {}

  connect(): Promise<void> {
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.opts.url);
      } catch (err) {
        reject(err);
        return;
      }
      this.setStatus("connecting");

      const opened = () => {
        cleanup();
        this.retryAttempt = 0;
        this.setStatus("connected");
        resolve();
      };
      const errored = () => {
        cleanup();
        this.ws?.close();
        reject(new Error("Signaling connection failed"));
      };
      const cleanup = () => {
        this.ws?.removeEventListener("open", opened);
        this.ws?.removeEventListener("error", errored);
      };

      this.ws.addEventListener("open", opened);
      this.ws.addEventListener("error", errored);
      this.ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as SignalServerMessage;
          log.debug(
            "◀",
            msg.t,
            ...(msg.t === "signal" ? [("ice" in msg ? (msg as { payload: { ice?: unknown } }).payload.ice ? "ice" : "sdp" : "sdp")] : []),
          );
          this.onMessage(msg);
        } catch (err) {
          log.warn("Unparsable signaling message", err);
        }
      });
      this.ws.addEventListener("close", (event) => {
        this.setStatus("closed");
        if (!this.intentionalClose) {
          log.debug(`Closed (code ${event.code}) — scheduling reconnect`);
          this.scheduleReconnect();
        }
      });
    });
  }

  send(msg: SignalClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      log.warn("send() while not open:", msg.t);
      return false;
    }
    log.debug("▶", msg.t, ...(msg.t === "signal" ? [("ice" in msg ? (msg as { payload: { ice?: unknown } }).payload.ice ? "ice" : "sdp" : "sdp")] : []));
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close(1000, "bye");
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus("closed");
  }

  get currentStatus(): SignalingStatus {
    return this.status;
  }

  /** True once a socket is live — used to surface "signaling unavailable". */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    // Exponential backoff capped at 10s. After reconnecting, callers observe
    // 'connected' status and re-issue join_room with the stable playerId.
    const delay = Math.min(10000, 500 * 2 ** this.retryAttempt++);
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private setStatus(s: SignalingStatus): void {
    if (this.status !== s) {
      this.status = s;
      log.debug("status:", s);
      this.opts.onStatus(s);
    }
  }

  static playerIdFor(name: string): PlayerId {
    // Stable per app session; long enough for deterministic host election.
    const rand = Math.random().toString(36).slice(2, 8);
    return `${name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "player"}-${Date.now().toString(36)}-${rand}`.toLowerCase();
  }
}
