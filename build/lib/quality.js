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
var quality_exports = {};
__export(quality_exports, {
  LIVESTREAM_QUALITY_LABELS: () => LIVESTREAM_QUALITY_LABELS,
  VIDEO_STREAMING_QUALITY_AUTO_LABEL: () => VIDEO_STREAMING_QUALITY_AUTO_LABEL,
  fixedStreamingQualities: () => fixedStreamingQualities,
  isAutoStreamingQuality: () => isAutoStreamingQuality,
  resolveStreamingQuality: () => resolveStreamingQuality
});
module.exports = __toCommonJS(quality_exports);
const VIDEO_STREAMING_QUALITY_AUTO_LABEL = "Auto";
const LIVESTREAM_QUALITY_LABELS = { low: "Low", medium: "Medium", high: "High" };
const isAutoStreamingQuality = (label) => typeof label === "string" && label.startsWith(VIDEO_STREAMING_QUALITY_AUTO_LABEL);
const fixedStreamingQualities = (states) => Object.entries(states ?? {}).filter(([, label]) => !isAutoStreamingQuality(label)).map(([value, label]) => `${value} = ${label}`).join(", ");
const resolveStreamingQuality = (states, value, setting) => {
  const wanted = LIVESTREAM_QUALITY_LABELS[setting];
  if (!wanted) {
    return { kind: "keep" };
  }
  const current = (states == null ? void 0 : states[value]) ?? String(value);
  if (current === wanted || current.startsWith(`${wanted} / `)) {
    return { kind: "keep" };
  }
  const entries = Object.entries(states ?? {});
  const encoding = current.includes(" / ") ? current.slice(current.indexOf(" / ")) : "";
  const target = entries.find(([, label]) => label === `${wanted}${encoding}`) ?? entries.find(([, label]) => label === wanted) ?? entries.find(([, label]) => label.startsWith(`${wanted} / `));
  if (!target) {
    return { kind: "unavailable", wanted };
  }
  return { kind: "set", value: Number(target[0]), from: current, to: target[1] };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LIVESTREAM_QUALITY_LABELS,
  VIDEO_STREAMING_QUALITY_AUTO_LABEL,
  fixedStreamingQualities,
  isAutoStreamingQuality,
  resolveStreamingQuality
});
//# sourceMappingURL=quality.js.map
