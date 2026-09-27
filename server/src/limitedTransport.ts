import { WebSocketTransport, type TransportOptions } from "@colyseus/ws-transport";
import { MAX_MESSAGE_BYTES, MAX_SOCKET_CONNECTIONS, TokenBucket } from "./loadLimits.js";
import type { IncomingMessage } from "node:http";

type VerifyInfo = { origin: string; secure: boolean; req: IncomingMessage };

/** Raw frame budget is installed before Colyseus attaches its decoder. */
export class LimitedTransport extends WebSocketTransport {
  constructor(options: Omit<TransportOptions, "verifyClient"> & { verifyClient?: (info: VerifyInfo) => boolean }) {
    let connectionCount = () => 0;
    const verify = options.verifyClient;
    super({ ...options, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false,
      verifyClient: (info: VerifyInfo) => connectionCount() < MAX_SOCKET_CONNECTIONS && (!verify || verify(info)),
    });
    connectionCount = () => this.wss.clients.size;
    const processBudget = new TokenBucket(MAX_SOCKET_CONNECTIONS * 60, MAX_SOCKET_CONNECTIONS * 120);
    this.wss.prependListener("connection", socket => {
      const messages = new TokenBucket(60, 120);
      let blocked = false;
      socket.prependListener("message", () => {
        if (!blocked && messages.take() && processBudget.take()) return;
        blocked = true;
        // An EventEmitter may finish the current dispatch. Room handlers have
        // their own budget too; subsequent frames can no longer reach the decoder.
        socket.removeAllListeners("message");
        socket.terminate();
      });
    });
  }
}
