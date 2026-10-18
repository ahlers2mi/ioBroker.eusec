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
var ondemand_exports = {};
__export(ondemand_exports, {
  DEFAULT_OPTIONS: () => DEFAULT_OPTIONS,
  DEFAULT_START_ATTEMPT_OPTIONS: () => DEFAULT_START_ATTEMPT_OPTIONS,
  OnDemandStreams: () => OnDemandStreams,
  busyReason: () => busyReason,
  findAdtsStart: () => findAdtsStart,
  findKeyframeStart: () => findKeyframeStart,
  onDemandSource: () => onDemandSource,
  parseOnDemandPath: () => parseOnDemandPath,
  startUntilDelivered: () => startUntilDelivered,
  unreachableReason: () => unreachableReason
});
module.exports = __toCommonJS(ondemand_exports);
var import_node_http = __toESM(require("node:http"));
var import_node_stream = __toESM(require("node:stream"));
const DEFAULT_START_ATTEMPT_OPTIONS = {
  attempts: 3,
  watch: 90,
  noResponse: 75,
  endWait: 5
};
const DEFAULT_OPTIONS = {
  idleStopDelay: 1e4,
  handoverDelay: 1e3,
  // Outlasts every attempt of startUntilDelivered(), plus the time the start commands take. A 504
  // in between makes go2rtc ask again, and for that moment nobody waits - the attempts would stop
  // as if the livestream had arrived, and a camera that never answers is never paused.
  firstDataTimeout: DEFAULT_START_ATTEMPT_OPTIONS.attempts * (DEFAULT_START_ATTEMPT_OPTIONS.endWait + DEFAULT_START_ATTEMPT_OPTIONS.watch) * 1e3 + 15e3,
  audioTimeout: 5e3,
  // The slowest start that still delivered took 62 seconds.
  startBlock: 7e4,
  unreachableFor: 6e4,
  // Several keyframes of a 4K camera - far more than a reader that keeps up ever leaves waiting.
  maxBuffered: 4 * 1024 * 1024
};
const SERIAL = /^[A-Za-z0-9_-]+$/;
const asciiName = (name) => {
  const ascii = name.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/[^\x20-\x7e]/g, "").trim();
  return ascii || "another device";
};
const busyReason = (name) => `Station busy - ${asciiName(name)} is streaming`;
const unreachableReason = (name) => `Camera not reachable - ${asciiName(name)}`;
const findKeyframeStart = (data, h265 = false) => {
  for (let i = 0; i + 3 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 1) {
      continue;
    }
    const header = data[i + 3];
    if (h265 ? (header >> 1 & 63) === 32 : (header & 31) === 7) {
      return i > 0 && data[i - 1] === 0 ? i - 1 : i;
    }
  }
  return -1;
};
const findAdtsStart = (data) => {
  for (let i = 0; i + 1 < data.length; i++) {
    if (data[i] === 255 && (data[i + 1] & 246) === 240) {
      return i;
    }
  }
  return -1;
};
const onDemandSource = (port, serial, track) => `http://127.0.0.1:${port}/${encodeURIComponent(serial)}/${track}`;
const parseOnDemandPath = (url) => {
  const [, serial, track, rest] = (url ?? "").split("?")[0].split("/");
  if (rest !== void 0 || !SERIAL.test(serial ?? "") || track !== "video" && track !== "audio") {
    return void 0;
  }
  return { serial, track };
};
class OnDemandStreams {
  constructor(hooks, options = {}) {
    this.hooks = hooks;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.server = import_node_http.default.createServer((request, response) => this.onRequest(request, response));
    this.server.requestTimeout = 0;
    this.server.headersTimeout = 1e4;
  }
  server;
  sessions = /* @__PURE__ */ new Map();
  options;
  port = 0;
  /**
   * Starts the server on a free port of the loopback interface - only go2rtc talks to it.
   *
   * @returns The port the server listens on
   */
  async listen() {
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    return this.port;
  }
  /**
   * The go2rtc sources of a device stream.
   *
   * @param serial Serial of the device
   * @returns Video and audio source
   */
  sources(serial) {
    return [onDemandSource(this.port, serial, "video"), onDemandSource(this.port, serial, "audio")];
  }
  /**
   * Hands a started livestream to the waiting and future requests of go2rtc. Called for every
   * livestream of the device, also one started for talkback or through start_stream.
   *
   * @param serial Serial of the device
   * @param video Video stream from the camera
   * @param audio Audio stream from the camera
   * @param videoFilter Transform the video passes before it reaches go2rtc
   * @param h265 Whether the video is H.265 instead of H.264
   */
  attach(serial, video, audio, videoFilter, h265 = false) {
    const session = this.session(serial);
    this.endLive(session);
    session.starting = false;
    session.unreachableUntil = void 0;
    session.watched = this.sinkCount(session) > 0;
    const live = {
      video,
      audio,
      videoFilter: videoFilter ?? new import_node_stream.default.PassThrough(),
      videoSeen: false,
      audioSeen: false,
      mute: false,
      h265
    };
    session.live = live;
    video.on("data", (chunk) => live.videoFilter.write(chunk));
    live.videoFilter.on("data", (chunk) => {
      if (!live.videoSeen) {
        live.videoSeen = true;
        const waited = session.requestedAt !== void 0 ? ` ${Math.round((Date.now() - session.requestedAt) / 1e3)} seconds after the request` : "";
        session.requestedAt = void 0;
        this.hooks.log.info(
          `On-demand stream ${serial}: first picture${waited}, ${session.sinks.video.size} video request(s) of go2rtc waiting`
        );
        live.audioTimer = setTimeout(() => {
          if (!live.audioSeen && session.live === live) {
            live.mute = true;
            this.hooks.log.info(
              `On-demand stream ${serial}: no audio within ${this.options.audioTimeout / 1e3} seconds - continuing without`
            );
            this.endSinks(session, "audio", 404);
          }
        }, this.options.audioTimeout);
      }
      this.write(session, "video", chunk, serial);
    });
    audio.on("data", (chunk) => {
      live.audioSeen = true;
      live.mute = false;
      this.write(session, "audio", chunk, serial);
    });
    video.on("error", () => {
    });
    audio.on("error", () => {
    });
    live.videoFilter.on("error", () => {
    });
  }
  /**
   * Pauses the starts of a device whose start attempts all failed, and frees its station: the
   * waiting requests of go2rtc are answered right away, and new ones get the same answer until
   * unreachableFor passed.
   *
   * @param serial Serial of the device
   */
  markUnreachable(serial) {
    var _a, _b;
    const session = this.session(serial);
    if (session.live) {
      return;
    }
    session.starting = false;
    session.unreachableUntil = Date.now() + this.options.unreachableFor;
    const reason = unreachableReason(((_b = (_a = this.hooks).name) == null ? void 0 : _b.call(_a, serial)) ?? serial);
    for (const track of ["video", "audio"]) {
      for (const sink of [...session.sinks[track]]) {
        if (!sink.response.headersSent) {
          this.removeSink(session, track, sink);
          sink.response.writeHead(503, reason).end();
        }
      }
    }
  }
  /**
   * Tells whether go2rtc waits for a livestream of the device that has not arrived yet.
   *
   * @param serial Serial of the device
   * @returns true while at least one request waits and no livestream is attached
   */
  isWaiting(serial) {
    const session = this.sessions.get(serial);
    return session !== void 0 && !session.live && this.sinkCount(session) > 0;
  }
  /**
   * Tells whether go2rtc consumes the stream of the device - waiting for it or receiving it.
   *
   * @param serial Serial of the device
   * @returns true while at least one request of go2rtc is open
   */
  isWatched(serial) {
    const session = this.sessions.get(serial);
    return session !== void 0 && this.sinkCount(session) > 0;
  }
  /**
   * Ends the requests of go2rtc for a livestream that stopped. go2rtc opens them again right away
   * if the stream is still watched, which starts the next livestream.
   *
   * @param serial Serial of the device
   */
  detach(serial) {
    const session = this.sessions.get(serial);
    if (!session) {
      return;
    }
    this.endLive(session);
    session.starting = session.start !== void 0;
    for (const track of ["video", "audio"]) {
      for (const sink of [...session.sinks[track]]) {
        if (sink.response.headersSent) {
          this.removeSink(session, track, sink);
          sink.response.end();
        }
      }
    }
    this.clearStopTimer(session);
  }
  async close() {
    for (const session of this.sessions.values()) {
      this.clearStopTimer(session);
      this.endLive(session);
      for (const track of ["video", "audio"]) {
        for (const sink of [...session.sinks[track]]) {
          this.removeSink(session, track, sink);
          sink.response.destroy();
        }
      }
    }
    this.sessions.clear();
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(() => resolve()));
  }
  onRequest(request, response) {
    var _a, _b, _c, _d, _e;
    const target = request.method === "GET" ? parseOnDemandPath(request.url) : void 0;
    if (!target) {
      response.writeHead(404).end();
      return;
    }
    const { serial, track } = target;
    const session = this.session(serial);
    if (track === "audio" && ((_a = session.live) == null ? void 0 : _a.mute)) {
      response.writeHead(404).end();
      return;
    }
    if (!session.live && (session.unreachableUntil ?? 0) > Date.now()) {
      this.hooks.log.debug(`On-demand stream ${serial}: not reachable - not started`);
      response.writeHead(503, unreachableReason(((_c = (_b = this.hooks).name) == null ? void 0 : _c.call(_b, serial)) ?? serial)).end();
      return;
    }
    if (!session.live && !session.starting) {
      const busy = this.stationBusyWith(serial);
      if (busy) {
        const message = `On-demand stream ${serial}: the station is busy with the livestream of ${busy} - not started`;
        if (session.refusedFor === busy) {
          this.hooks.log.debug(message);
        } else {
          this.hooks.log.info(message);
          session.refusedFor = busy;
        }
        session.refusedAt = Date.now();
        response.writeHead(503, busyReason(((_e = (_d = this.hooks).name) == null ? void 0 : _e.call(_d, busy)) ?? busy)).end();
        return;
      }
      session.refusedFor = void 0;
      session.refusedAt = void 0;
    }
    const sink = {
      response,
      aligned: false,
      congested: false,
      timeout: setTimeout(() => {
        this.hooks.log.warn(
          `On-demand stream ${serial}: the camera delivered no ${track} within ${this.options.firstDataTimeout / 1e3} seconds`
        );
        this.removeSink(session, track, sink);
        response.writeHead(504).end();
      }, this.options.firstDataTimeout)
    };
    session.sinks[track].add(sink);
    session.watched = true;
    this.clearStopTimer(session);
    const opened = Date.now();
    response.on("close", () => {
      if (this.removeSink(session, track, sink)) {
        if (!response.headersSent) {
          this.hooks.log.info(
            `On-demand stream ${serial}: go2rtc stopped waiting for the ${track} after ${Math.round((Date.now() - opened) / 1e3)} seconds`
          );
        }
        this.scheduleStop(serial, session);
      }
    });
    this.hooks.log.debug(
      `On-demand stream ${serial}: go2rtc requests the ${track}${session.live ? " of the running livestream" : ""}`
    );
    if (!session.live && !session.start) {
      session.starting = true;
      session.requestedAt = Date.now();
      session.startedAt = session.requestedAt;
      this.hooks.log.info(`On-demand stream ${serial}: requested by go2rtc - starting livestream`);
      const start = this.hooks.start(serial).catch((error) => {
        session.starting = false;
        this.hooks.log.warn(`On-demand stream ${serial}: livestream could not be started: ${error}`);
      }).finally(() => {
        if (session.start === start) {
          session.start = void 0;
        }
      });
      session.start = start;
    }
  }
  /**
   * Finds another device of the same group whose livestream is starting or watched. Starting
   * the requested device would end that livestream.
   *
   * @param serial Serial of the device that is requested
   * @returns The serial of that device, if there is one
   */
  stationBusyWith(serial) {
    var _a, _b, _c, _d;
    const group = (_b = (_a = this.hooks).group) == null ? void 0 : _b.call(_a, serial);
    if (group === void 0) {
      return void 0;
    }
    for (const [other, session] of this.sessions) {
      const starting = session.starting && Date.now() - (session.startedAt ?? 0) < this.options.startBlock;
      if (other !== serial && (session.live || starting) && this.sinkCount(session) > 0 && ((_d = (_c = this.hooks).group) == null ? void 0 : _d.call(_c, other)) === group) {
        return other;
      }
    }
    return void 0;
  }
  write(session, track, chunk, serial) {
    var _a;
    for (const sink of session.sinks[track]) {
      if (sink.congested) {
        continue;
      }
      let data = chunk;
      if (!sink.aligned) {
        const offset = track === "video" ? findKeyframeStart(chunk, (_a = session.live) == null ? void 0 : _a.h265) : findAdtsStart(chunk);
        if (offset < 0) {
          continue;
        }
        data = chunk.subarray(offset);
        if (track === "video" && data[2] === 1) {
          data = Buffer.concat([Buffer.from([0]), data]);
        }
        sink.aligned = true;
      }
      if (!sink.response.headersSent) {
        clearTimeout(sink.timeout);
        sink.response.writeHead(200, { "Content-Type": "application/octet-stream" });
      }
      sink.response.write(data);
      if (sink.response.writableLength > this.options.maxBuffered) {
        sink.congested = true;
        this.hooks.log.debug(
          `On-demand stream ${serial}: go2rtc does not keep up with the ${track} - dropping data`
        );
        sink.response.once("drain", () => {
          sink.congested = false;
          sink.aligned = false;
        });
      }
    }
  }
  scheduleStop(serial, session) {
    if (this.sinkCount(session) > 0 || !session.watched) {
      return;
    }
    this.clearStopTimer(session);
    session.stopTimer = setTimeout(
      () => {
        session.stopTimer = void 0;
        if (this.sinkCount(session) > 0 || !session.live && !session.starting) {
          return;
        }
        session.watched = false;
        session.starting = false;
        this.hooks.log.info(`On-demand stream ${serial}: nobody watches anymore - stopping livestream`);
        this.hooks.stop(serial).catch((error) => {
          this.hooks.log.warn(`On-demand stream ${serial}: livestream could not be stopped: ${error}`);
        });
      },
      this.waitedFor(serial) ? this.options.handoverDelay : this.options.idleStopDelay
    );
  }
  /**
   * Tells whether another device of the same group was refused recently because of this one.
   *
   * @param serial Serial of the device whose livestream nobody watches anymore
   * @returns true if a player of another device waits for the station
   */
  waitedFor(serial) {
    var _a, _b, _c, _d;
    const group = (_b = (_a = this.hooks).group) == null ? void 0 : _b.call(_a, serial);
    if (group === void 0) {
      return false;
    }
    const recent = Date.now() - 3e4;
    for (const [other, session] of this.sessions) {
      if (other !== serial && session.refusedFor === serial && (session.refusedAt ?? 0) > recent && ((_d = (_c = this.hooks).group) == null ? void 0 : _d.call(_c, other)) === group) {
        return true;
      }
    }
    return false;
  }
  session(serial) {
    let session = this.sessions.get(serial);
    if (!session) {
      session = { sinks: { video: /* @__PURE__ */ new Set(), audio: /* @__PURE__ */ new Set() }, starting: false, watched: false };
      this.sessions.set(serial, session);
    }
    return session;
  }
  sinkCount(session) {
    return session.sinks.video.size + session.sinks.audio.size;
  }
  removeSink(session, track, sink) {
    clearTimeout(sink.timeout);
    return session.sinks[track].delete(sink);
  }
  endSinks(session, track, status) {
    for (const sink of [...session.sinks[track]]) {
      this.removeSink(session, track, sink);
      if (sink.response.headersSent) {
        sink.response.end();
      } else {
        sink.response.writeHead(status).end();
      }
    }
  }
  endLive(session) {
    const live = session.live;
    if (!live) {
      return;
    }
    clearTimeout(live.audioTimer);
    live.video.removeAllListeners("data");
    live.audio.removeAllListeners("data");
    live.videoFilter.removeAllListeners("data");
    live.video.resume();
    live.audio.resume();
    session.live = void 0;
  }
  clearStopTimer(session) {
    if (session.stopTimer) {
      clearTimeout(session.stopTimer);
      session.stopTimer = void 0;
    }
  }
}
const startUntilDelivered = async (serial, hooks, options = {}) => {
  const { attempts, watch, noResponse, endWait } = { ...DEFAULT_START_ATTEMPT_OPTIONS, ...options };
  const waitForLivestreamEnd = async () => {
    for (let second = 0; second < endWait; second++) {
      if (!await hooks.isStreaming(serial)) {
        return true;
      }
      await hooks.sleep(1e3);
    }
    return false;
  };
  const startFailed = async () => {
    let streaming = false;
    for (let second = 1; second <= watch; second++) {
      await hooks.sleep(1e3);
      if (hooks.cancelled() || !hooks.isWaiting(serial)) {
        return false;
      }
      const now = await hooks.isStreaming(serial);
      if (streaming && !now) {
        return true;
      }
      streaming ||= now;
      if (now && second >= noResponse) {
        hooks.log.info(`On-demand stream ${serial}: the camera did not answer within ${second} seconds`);
        await hooks.stop(serial).catch(() => {
        });
        return true;
      }
    }
    return false;
  };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (!await waitForLivestreamEnd()) {
      hooks.log.debug(`On-demand stream ${serial}: a livestream is already running`);
      return;
    }
    await hooks.start(serial);
    if (!await startFailed()) {
      return;
    }
    const next = attempt < attempts ? " - starting it again" : "";
    hooks.log.info(`On-demand stream ${serial}: the camera acknowledged the livestream but sent no data${next}`);
  }
  hooks.log.warn(
    `On-demand stream ${serial}: the camera did not deliver in ${attempts} attempts - not starting it for a minute`
  );
  hooks.markUnreachable(serial);
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_OPTIONS,
  DEFAULT_START_ATTEMPT_OPTIONS,
  OnDemandStreams,
  busyReason,
  findAdtsStart,
  findKeyframeStart,
  onDemandSource,
  parseOnDemandPath,
  startUntilDelivered,
  unreachableReason
});
//# sourceMappingURL=ondemand.js.map
