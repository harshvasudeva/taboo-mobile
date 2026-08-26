/**
 * Taboo WebRTC signaling Worker.
 *
 * Scope (intentionally narrow):
 *   ✅ room create/join/leave, peer presence
 *   ✅ opaque relay of SDP offers/answers + ICE candidates
 *   ❌ game state  ❌ scoring  ❌ words  ❌ timers
 *
 * Once peers exchange SDP+ICE and their DataChannel opens, this Worker is
 * out of the loop for gameplay entirely.
 */
import { handleDisconnect, handleMessage } from "./signaling";
import { sweepExpiredRooms } from "./rooms";

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      sweepExpiredRooms();
      return Response.json({ status: "ok", service: "taboo-signaling" });
    }

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      server.addEventListener("message", (event) => {
        try {
          handleMessage(server, typeof event.data === "string" ? event.data : "");
        } catch (err) {
          try {
            server.send(
              JSON.stringify({
                kind: "signal",
                t: "error",
                code: "SERVER_ERROR",
                message: "Internal error",
              }),
            );
          } catch {
            /* socket gone */
          }
          console.error("signaling handler error", err);
        }
      });
      server.addEventListener("close", () => {
        try {
          handleDisconnect(server);
        } catch (err) {
          console.error("signaling disconnect error", err);
        }
      });

      // Keep the WS alive for the duration of the connection.
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
