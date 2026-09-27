/* global require */

const { TextDecoder, TextEncoder } = require("util");

if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder;
}
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
}
