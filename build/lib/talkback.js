"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var talkback_exports = {};
__export(talkback_exports, {
  AdtsFramer: () => AdtsFramer,
  parseTalkbackSource: () => parseTalkbackSource,
  pipeToTalkback: () => pipeToTalkback,
  talkbackFfmpegArgs: () => talkbackFfmpegArgs,
  waitForDeviceEvent: () => waitForDeviceEvent
});
module.exports = __toCommonJS(talkback_exports);
var import_node_child_process = require("node:child_process");
var import_node_events = require("node:events");
var import_node_path = __toESM(require("node:path"));
var import_node_stream = require("node:stream");
const ADTS_HEADER_LENGTH = 7;
class AdtsFramer extends import_node_stream.Transform {
  pending = Buffer.alloc(0);
  _transform(chunk, _encoding, callback) {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    let offset = 0;
    while (this.pending.length - offset >= ADTS_HEADER_LENGTH) {
      if (this.pending[offset] !== 255 || (this.pending[offset + 1] & 246) !== 240) {
        offset++;
        continue;
      }
      const frameLength = (this.pending[offset + 3] & 3) << 11 | this.pending[offset + 4] << 3 | this.pending[offset + 5] >> 5;
      if (frameLength < ADTS_HEADER_LENGTH) {
        offset++;
        continue;
      }
      if (this.pending.length - offset < frameLength) {
        break;
      }
      this.push(this.pending.subarray(offset, offset + frameLength));
      offset += frameLength;
    }
    this.pending = this.pending.subarray(offset);
    callback();
  }
}
const parseTalkbackSource = (value) => {
  if (typeof value !== "string") {
    return void 0;
  }
  const source = value.trim();
  if (/^https?:\/\/[^\s]+$/i.test(source)) {
    return source;
  }
  if (import_node_path.default.isAbsolute(source) && !source.startsWith("-") && !/^[a-z][a-z0-9+.-]*:(?![\\/])/i.test(source)) {
    return source;
  }
  return void 0;
};
const talkbackFfmpegArgs = (source) => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-protocol_whitelist",
  "file,http,https,tcp,tls",
  "-re",
  "-i",
  source,
  "-vn",
  "-acodec",
  "aac",
  "-profile:a",
  "aac_low",
  "-ar",
  "16000",
  "-ac",
  "1",
  "-b:a",
  "20k",
  "-f",
  "adts",
  "pipe:1"
];
const waitForDeviceEvent = async (emitter, event, serial, timeoutMs) => {
  var _a;
  try {
    for await (const args of (0, import_node_events.on)(emitter, event, { signal: AbortSignal.timeout(timeoutMs) })) {
      const device = args[1];
      if (((_a = device == null ? void 0 : device.getSerial) == null ? void 0 : _a.call(device)) === serial) {
        return args;
      }
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      throw error;
    }
  }
  throw new Error(`No "${event}" for device ${serial} within ${timeoutMs / 1e3} seconds`);
};
const pipeToTalkback = (command, args, talkbackStream, signal) => new Promise((resolve, reject) => {
  const child = (0, import_node_child_process.spawn)(command, args, { stdio: ["ignore", "pipe", "pipe"], signal });
  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr = (stderr + data.toString()).slice(-500);
  });
  child.stdout.pipe(new AdtsFramer()).pipe(talkbackStream, { end: false });
  child.on("error", (error) => signal.aborted ? resolve() : reject(error));
  child.on("close", (code) => {
    if (code === 0 || signal.aborted) {
      resolve();
    } else {
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    }
  });
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AdtsFramer,
  parseTalkbackSource,
  pipeToTalkback,
  talkbackFfmpegArgs,
  waitForDeviceEvent
});
//# sourceMappingURL=talkback.js.map
