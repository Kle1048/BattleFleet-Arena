import { Client } from "colyseus.js";

function normalizeHostForColyseus(pageHostname: string): string {
  const h = pageHostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    h === "localhost" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "127.0.0.1"
  ) {
    return "127.0.0.1";
  }
  return pageHostname;
}

export function colyseusHttpBase(
  fromEnv: unknown,
  pageHostname: string | undefined,
): string {
  if (fromEnv != null && String(fromEnv).length > 0) {
    return String(fromEnv).replace(/\/$/, "");
  }
  const host =
    typeof pageHostname === "string" && pageHostname.length > 0 ? pageHostname : "127.0.0.1";
  const gameHost = normalizeHostForColyseus(host);
  return `http://${gameHost}:2567`;
}

export function createColyseusClient(url: string): Client {
  return new Client(url);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(new Error(label));
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });
}
