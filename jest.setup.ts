import { TextEncoder, TextDecoder } from "util";

// Polyfill TextEncoder and TextDecoder in jsdom test environment
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  (global as any).TextDecoder = TextDecoder;
}

// Polyfill fetch and Response if missing
if (typeof global.fetch === "undefined") {
  global.fetch = jest.fn() as any;
}
if (typeof global.Response === "undefined") {
  (global as any).Response = class Response {
    body: any;
    status: number;
    ok: boolean;
    constructor(body?: any, init?: any) {
      this.body = body;
      this.status = init?.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
    }
    async json() {
      return typeof this.body === "string" ? JSON.parse(this.body) : this.body;
    }
    async text() {
      return typeof this.body === "string" ? this.body : JSON.stringify(this.body);
    }
  };
}

// Dummy environment variable for tests
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://dummy:dummy@localhost:5432/dummy";
