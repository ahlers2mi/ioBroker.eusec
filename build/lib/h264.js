"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var h264_exports = {};
__export(h264_exports, {
  createSpsLevelPatcher: () => createSpsLevelPatcher,
  requiredLevel: () => requiredLevel
});
module.exports = __toCommonJS(h264_exports);
var import_node_stream = require("node:stream");
const NAL_TYPE_SPS = 7;
const HIGH_PROFILES = /* @__PURE__ */ new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);
const PROFILES = /* @__PURE__ */ new Set([66, 77, 88, ...HIGH_PROFILES]);
const LEVELS = [
  [10, 99, 1485, 396],
  [11, 396, 3e3, 900],
  [12, 396, 6e3, 2376],
  [13, 396, 11880, 2376],
  [20, 396, 11880, 2376],
  [21, 792, 19800, 4752],
  [22, 1620, 20250, 8100],
  [30, 1620, 40500, 8100],
  [31, 3600, 108e3, 18e3],
  [32, 5120, 216e3, 20480],
  [40, 8192, 245760, 32768],
  [41, 8192, 245760, 32768],
  [42, 8704, 522240, 34816],
  [50, 22080, 589824, 110400],
  [51, 36864, 983040, 184320],
  [52, 36864, 2073600, 184320]
];
const ASSUMED_FPS = 30;
const MAX_PENDING_SPS = 4096;
class BitReader {
  constructor(data) {
    this.data = data;
  }
  pos = 0;
  /**
   * Reads a single bit.
   *
   * @returns The bit
   */
  bit() {
    const byte = this.data[this.pos >> 3];
    if (byte === void 0) {
      throw new Error("SPS truncated");
    }
    return byte >> 7 - (this.pos++ & 7) & 1;
  }
  /**
   * Reads a fixed number of bits, most significant first.
   *
   * @param count How many bits to read
   * @returns The value of those bits
   */
  bits(count) {
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = value << 1 | this.bit();
    }
    return value;
  }
  /**
   * Reads an unsigned Exp-Golomb coded value, `ue(v)` in the syntax table.
   *
   * @returns The decoded value
   */
  ue() {
    let zeros = 0;
    while (this.bit() === 0) {
      if (++zeros > 31) {
        throw new Error("SPS malformed");
      }
    }
    return zeros === 0 ? 0 : (1 << zeros) - 1 + this.bits(zeros);
  }
  /**
   * Reads a signed Exp-Golomb coded value, `se(v)` in the syntax table.
   *
   * @returns The decoded value
   */
  se() {
    const value = this.ue();
    return value & 1 ? value + 1 >> 1 : -(value >> 1);
  }
}
const toRbsp = (nal) => {
  const out = new Uint8Array(nal.length);
  let length = 0;
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) {
      continue;
    }
    out[length++] = nal[i];
  }
  return out.subarray(0, length);
};
const skipScalingLists = (reader, count) => {
  for (let i = 0; i < count; i++) {
    if (!reader.bit()) {
      continue;
    }
    let last = 8;
    let next = 8;
    for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
      if (next !== 0) {
        next = (last + reader.se() + 256) % 256;
      }
      last = next === 0 ? last : next;
    }
  }
};
const pickLevel = (mbPerFrame, mbPerSecond, refFrames) => {
  var _a;
  return (_a = LEVELS.find(
    ([, maxFs, maxMbps, maxDpb]) => mbPerFrame <= maxFs && mbPerSecond <= maxMbps && refFrames * mbPerFrame <= maxDpb
  )) == null ? void 0 : _a[0];
};
const requiredLevel = (sps, fps) => {
  try {
    const reader = new BitReader(toRbsp(sps));
    reader.bits(8);
    const profile = reader.bits(8);
    if (!PROFILES.has(profile)) {
      return void 0;
    }
    reader.bits(16);
    reader.ue();
    if (HIGH_PROFILES.has(profile)) {
      const chromaFormat = reader.ue();
      if (chromaFormat === 3) {
        reader.bit();
      }
      reader.ue();
      reader.ue();
      reader.bit();
      if (reader.bit()) {
        skipScalingLists(reader, chromaFormat === 3 ? 12 : 8);
      }
    }
    reader.ue();
    const pocType = reader.ue();
    if (pocType === 0) {
      reader.ue();
    } else if (pocType === 1) {
      reader.bit();
      reader.se();
      reader.se();
      const cycle = reader.ue();
      for (let i = 0; i < cycle; i++) {
        reader.se();
      }
    }
    const refFrames = reader.ue();
    reader.bit();
    const widthMbs = reader.ue() + 1;
    const heightMapUnits = reader.ue() + 1;
    const heightMbs = (2 - reader.bit()) * heightMapUnits;
    const mbPerFrame = widthMbs * heightMbs;
    return pickLevel(mbPerFrame, mbPerFrame * Math.max(fps, ASSUMED_FPS), Math.max(refFrames, 1));
  } catch {
    return void 0;
  }
};
const nextStartCode = (buffer, from) => {
  for (let i = from; i + 2 < buffer.length; i++) {
    if (buffer[i] === 0 && buffer[i + 1] === 0 && buffer[i + 2] === 1) {
      return i;
    }
  }
  return -1;
};
const createSpsLevelPatcher = (fps, onLevel) => {
  let carry = Buffer.alloc(0);
  let reported = 0;
  return new import_node_stream.Transform({
    transform(chunk, _encoding, callback) {
      const buffer = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
      let pending = -1;
      for (let i = 0; i + 6 < buffer.length; i++) {
        if (buffer[i] !== 0 || buffer[i + 1] !== 0 || buffer[i + 2] !== 1) {
          continue;
        }
        if ((buffer[i + 3] & 31) !== NAL_TYPE_SPS) {
          continue;
        }
        const end = nextStartCode(buffer, i + 3);
        if (end < 0) {
          if (buffer.length - i <= MAX_PENDING_SPS) {
            pending = i;
            break;
          }
          continue;
        }
        const level = requiredLevel(buffer.subarray(i + 3, end), fps);
        if (level === void 0 || level >= buffer[i + 6]) {
          continue;
        }
        if (level !== reported) {
          reported = level;
          onLevel == null ? void 0 : onLevel(buffer[i + 6], level);
        }
        buffer[i + 6] = level;
        i = end - 1;
      }
      if (pending < 0) {
        pending = Math.max(0, buffer.length - 6);
      }
      carry = Buffer.from(buffer.subarray(pending));
      callback(null, buffer.subarray(0, pending));
    },
    flush(callback) {
      callback(null, carry);
    }
  });
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSpsLevelPatcher,
  requiredLevel
});
//# sourceMappingURL=h264.js.map
