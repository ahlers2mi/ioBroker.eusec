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
var video_exports = {};
__export(video_exports, {
  createVideoFilter: () => createVideoFilter,
  streamToGo2rtc: () => streamToGo2rtc
});
module.exports = __toCommonJS(video_exports);
var import_eufy_security_client = require("eufy-security-client");
var import_node_stream = __toESM(require("node:stream"));
var import_promises = require("node:stream/promises");
var import_go2rtc = require("./go2rtc");
var import_h264 = require("./h264");
var import_utils = require("./utils");
const createVideoFilter = (camera, metadata, log) => metadata.videoCodec === import_eufy_security_client.VideoCodec.H264 ? (0, import_h264.createSpsLevelPatcher)(
  metadata.videoFPS,
  (from, to) => log.info(
    `streamToGo2rtc(): ${camera} - Declared H.264 level ${(from / 10).toFixed(1)} replaced with ${(to / 10).toFixed(1)}`
  )
) : new import_node_stream.default.PassThrough();
const streamToGo2rtc = async (camera, videoStream, audioStream, log, config, _namespace, metadata) => {
  const { default: got } = await import("got");
  const api = got.extend({
    hooks: {
      beforeError: [
        (error) => {
          const { response, options } = error;
          const { method, url, prefixUrl } = options;
          const shortUrl = (0, import_utils.getShortUrl)(
            typeof url === "string" ? new URL(url) : url === void 0 ? new URL("") : url,
            typeof prefixUrl === "string" ? prefixUrl : prefixUrl.toString()
          );
          const body = (response == null ? void 0 : response.body) ? response.body : error.message;
          error.message = `${error.message} | method: ${method} url: ${shortUrl}`;
          if (response == null ? void 0 : response.body) {
            error.message = `${error.message} body: ${typeof body === "object" ? JSON.stringify(body) : body == null ? void 0 : body.toString()}`;
          }
          return error;
        }
      ]
    }
  });
  videoStream.on("error", (error) => {
    log.error("streamToGo2rtc(): Videostream Error", error);
  });
  audioStream.on("error", (error) => {
    log.error("streamToGo2rtc(): Audiostream Error", error);
  });
  const videoFilter = createVideoFilter(camera, metadata, log);
  const ingestUrl = `http://localhost:${config.go2rtc_api_port}/api/stream?dst=${camera}`;
  const ingest = () => api.stream.post(ingestUrl).on("request", (request) => request.flushHeaders());
  const results = await Promise.allSettled([
    (0, import_promises.pipeline)(
      videoStream,
      videoFilter,
      ingest().on("error", (error) => {
        if (!(0, import_go2rtc.isRegularStreamEnd)(error)) {
          log.error(`streamToGo2rtc(): Got Videostream Error: ${error.message}`);
        }
      }),
      new import_node_stream.default.PassThrough()
    ),
    (0, import_promises.pipeline)(
      audioStream,
      ingest().on("error", (error) => {
        if (!(0, import_go2rtc.isRegularStreamEnd)(error)) {
          log.error(`streamToGo2rtc(): Got Audiostream Error: ${error.message}`);
        }
      }),
      new import_node_stream.default.PassThrough()
    )
  ]);
  for (const result of results) {
    if (result.status === "rejected" && !(0, import_go2rtc.isRegularStreamEnd)(result.reason)) {
      log.error(`streamToGo2rtc(): Stream to go2rtc failed: ${result.reason}`);
    }
  }
  return results;
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createVideoFilter,
  streamToGo2rtc
});
//# sourceMappingURL=video.js.map
