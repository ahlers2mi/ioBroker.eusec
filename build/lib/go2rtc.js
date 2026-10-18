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
var go2rtc_exports = {};
__export(go2rtc_exports, {
  COMPAT_STREAM_SUFFIX: () => COMPAT_STREAM_SUFFIX,
  PLAYER_PAGE: () => PLAYER_PAGE,
  PLAYER_QUERY: () => PLAYER_QUERY,
  buildPlayerUrl: () => buildPlayerUrl,
  buildRtspUrl: () => buildRtspUrl,
  compatStreamSource: () => compatStreamSource,
  go2rtcStreamName: () => go2rtcStreamName,
  isRegularStreamEnd: () => isRegularStreamEnd,
  pickHostAddress: () => pickHostAddress,
  streamToGo2rtcFailed: () => streamToGo2rtcFailed
});
module.exports = __toCommonJS(go2rtc_exports);
const PLAYER_PAGE = "stream.html";
const PLAYER_QUERY = "background=false";
const isRegularStreamEnd = (error) => {
  var _a;
  const body = (_a = error == null ? void 0 : error.response) == null ? void 0 : _a.body;
  return typeof body === "string" && body.startsWith("EOF");
};
const streamToGo2rtcFailed = (results) => results.some((result) => result.status === "rejected" && !isRegularStreamEnd(result.reason));
const COMPAT_STREAM_SUFFIX = "_compat";
const go2rtcStreamName = (serial, compatSerials) => compatSerials.includes(serial) ? `${serial}${COMPAT_STREAM_SUFFIX}` : serial;
const compatStreamSource = (serial) => `ffmpeg:${serial}#video=h264#width=-2#height=720#audio=copy`;
const buildPlayerUrl = (hostname, apiPort, stream) => `http://${hostname}:${apiPort}/${PLAYER_PAGE}?src=${encodeURIComponent(stream)}&${PLAYER_QUERY}`;
const buildRtspUrl = (hostname, rtspPort, stream) => `rtsp://${hostname}:${rtspPort}/${encodeURIComponent(stream)}`;
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|lxc|lxd|cni|flannel|cali|tun|tap|wg|zt|tailscale)/i;
const isPrivateIPv4 = (address) => /^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
const pickHostAddress = (interfaces) => {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces ?? {})) {
    if (VIRTUAL_INTERFACE.test(name)) {
      continue;
    }
    for (const entry of addresses ?? []) {
      const ipv4 = entry.family === "IPv4" || entry.family === 4;
      if (ipv4 && !entry.internal && !entry.address.startsWith("169.254.")) {
        candidates.push(entry.address);
      }
    }
  }
  return candidates.find(isPrivateIPv4) ?? candidates[0];
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  COMPAT_STREAM_SUFFIX,
  PLAYER_PAGE,
  PLAYER_QUERY,
  buildPlayerUrl,
  buildRtspUrl,
  compatStreamSource,
  go2rtcStreamName,
  isRegularStreamEnd,
  pickHostAddress,
  streamToGo2rtcFailed
});
//# sourceMappingURL=go2rtc.js.map
