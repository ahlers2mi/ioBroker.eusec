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
var main_exports = {};
__export(main_exports, {
  euSec: () => euSec
});
module.exports = __toCommonJS(main_exports);
var import_adapter_core = require("@iobroker/adapter-core");
var path = __toESM(require("node:path"));
var import_node_crypto = require("node:crypto");
var import_eufy_security_client = require("eufy-security-client");
var import_i18n_iso_countries = require("i18n-iso-countries");
var import_i18n_iso_languages = require("@cospired/i18n-iso-languages");
var import_node_child_process = __toESM(require("node:child_process"));
var import_go2rtc_static = __toESM(require("go2rtc-static"));
var import_ffmpeg_for_homebridge = __toESM(require("ffmpeg-for-homebridge"));
var import_types = require("./lib/types");
var import_utils = require("./lib/utils");
var import_messages = require("./lib/messages");
var import_picture = require("./lib/picture");
var import_log = require("./lib/log");
var import_eufyApiCompat = require("./lib/eufyApiCompat");
var import_go2rtc = require("./lib/go2rtc");
var import_overview = require("./lib/overview");
var import_quality = require("./lib/quality");
var import_video = require("./lib/video");
var import_ondemand = require("./lib/ondemand");
var import_talkback = require("./lib/talkback");
const GO2RTC_RESTART_DELAY_MIN = 1e3;
const GO2RTC_RESTART_DELAY_MAX = 3e4;
const GO2RTC_HEALTHY_RUNTIME = 6e4;
const LIVESTREAM_DATA_WAIT_DEFAULT = 15;
const LIVESTREAM_START_ALLOWANCE = 120;
const STREAM_OVERVIEW_COMMAND = "streamOverview";
class euSec extends import_adapter_core.Adapter {
  eufy;
  persistentFile = "adapter.json";
  persistentDriverFile = "driver.json";
  logger;
  persistentData = {
    version: ""
  };
  captchaId = null;
  verify_code = false;
  go2rtcProcess = void 0;
  go2rtcRestartTimeout = void 0;
  go2rtcRestarts = 0;
  terminating = false;
  /** Running talkbacks by device serial; aborting one stops its encoder. */
  talkbacks = /* @__PURE__ */ new Map();
  /** Devices whose event picture is being fetched from the station over P2P (#136). */
  p2pPictureRequests = /* @__PURE__ */ new Set();
  /** Maximum livestream duration per device, counted from the first picture. */
  livestreamTimeouts = /* @__PURE__ */ new Map();
  /** Devices and qualities the streaming quality hints were logged for in this run. */
  qualityHints = /* @__PURE__ */ new Set();
  /*
   * ahlers2mi: Bilder kommen auch dann, wenn gerade nichts passiert ist: Station.onConnect()
   * der Bibliothek fragt per P2P die letzten Ereignisse ab (databaseQueryLatestInfo),
   * woraufhin fuer JEDE Kamera das Bild ihres letzten - womoeglich Tage alten -
   * Ereignisses geladen wird. Das passiert bei JEDEM Verbindungsaufbau: beim Adapterstart
   * wie mitten im Betrieb, wenn die Station sich neu verbindet. Ausserdem liefert ein
   * einzelnes Ereignis zwei Bilder: erst das Push-Vorschaubild aus der Cloud, Sekunden
   * spaeter den P2P-Ausschnitt. Beides faengt suppressPictureStates() ab, bevor
   * picture_url/picture_html geschrieben werden. Die Bilddatei selbst wird immer geschrieben.
   */
  pictureGraceUntil = 0;
  lastPicture = /* @__PURE__ */ new Map();
  lastEvent = /* @__PURE__ */ new Map();
  /** The address the URLs use because no host name is configured. */
  hostnameAuto = void 0;
  /** Feeds go2rtc on request instead of pushing, see the setting "Start livestreams on demand". */
  onDemand = void 0;
  /** Devices whose on-demand stop waits for the end of their talkback. */
  stopsAfterTalkback = /* @__PURE__ */ new Set();
  constructor(options = {}) {
    super({
      ...options,
      name: "eusec"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
    process.on("exit", () => {
      var _a;
      return (_a = this.go2rtcProcess) == null ? void 0 : _a.kill();
    });
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    var _a;
    this.logger = new import_log.ioBrokerLogger(this.log);
    await this.setObjectNotExistsAsync("verify_code", {
      type: "state",
      common: {
        name: "2FA verification code",
        type: "string",
        role: "state",
        read: true,
        write: true
      },
      native: {}
    });
    await this.setObjectNotExistsAsync("received_captcha_html", {
      type: "state",
      common: {
        name: "Received captcha image HTML",
        type: "string",
        role: "state",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setObjectNotExistsAsync("captcha", {
      type: "state",
      common: {
        name: "Enter captcha",
        type: "string",
        role: "state",
        read: true,
        write: true
      },
      native: {}
    });
    await this.setObjectNotExistsAsync("info", {
      type: "channel",
      common: {
        name: "info"
      },
      native: {}
    });
    await this.setObjectNotExistsAsync("info.connection", {
      type: "state",
      common: {
        name: "Global connection",
        type: "boolean",
        role: "indicator.connection",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setStateAsync("info.connection", { val: false, ack: true });
    await this.setObjectNotExistsAsync("info.push_connection", {
      type: "state",
      common: {
        name: "Push notification connection",
        type: "boolean",
        role: "indicator.connection",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setStateAsync("info.push_connection", { val: false, ack: true });
    await this.setObjectNotExistsAsync("info.mqtt_connection", {
      type: "state",
      common: {
        name: "MQTT connection",
        type: "boolean",
        role: "indicator.connection",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setStateAsync("info.mqtt_connection", { val: false, ack: true });
    try {
      const connection = await this.getStatesAsync("*.connection");
      for (const id of Object.keys(connection ?? {})) {
        await this.setStateAsync(id, { val: false, ack: true });
      }
    } catch (error) {
      this.logger.error("Reset connection states - Error", error);
    }
    try {
      const sensorList = [
        import_eufy_security_client.PropertyName.DeviceMotionDetected,
        import_eufy_security_client.PropertyName.DevicePersonDetected,
        import_eufy_security_client.PropertyName.DeviceSoundDetected,
        import_eufy_security_client.PropertyName.DeviceCryingDetected,
        import_eufy_security_client.PropertyName.DevicePetDetected,
        import_eufy_security_client.PropertyName.DeviceRinging
      ];
      for (const sensorName of sensorList) {
        const sensors = await this.getStatesAsync(`*.${(0, import_utils.convertCamelCaseToSnakeCase)(sensorName)}`);
        for (const id of Object.keys(sensors ?? {})) {
          await this.setStateAsync(id, { val: false, ack: true });
        }
      }
    } catch (error) {
      this.logger.error("Reset sensor states - Error", error);
    }
    try {
      if (await this.fileExistsAsync(this.namespace, this.persistentFile)) {
        const fileContent = await this.readFileAsync(this.namespace, this.persistentFile);
        this.persistentData = JSON.parse(fileContent.file.toString("utf8"));
      }
    } catch (error) {
      this.logger.debug("No adapter stored data from last exit found.", error);
    }
    let persistentDriverData = "{}";
    try {
      if (await this.fileExistsAsync(this.namespace, this.persistentDriverFile)) {
        const fileContent = await this.readFileAsync(this.namespace, this.persistentDriverFile);
        persistentDriverData = fileContent.file.toString("utf8");
      }
    } catch (error) {
      this.logger.debug("No driver stored data from last exit found.", error);
    }
    this.subscribeStates("verify_code");
    this.subscribeStates("captcha");
    const hosts = await this.getForeignObjectsAsync("system.host.*", "host");
    if (hosts !== void 0 && hosts !== null && Object.values(hosts).length !== 0) {
      if (this.config.hostname === "") {
        const host = hosts[`system.host.${this.host}`] ?? Object.values(hosts)[0];
        this.config.hostname = (0, import_go2rtc.pickHostAddress)((_a = host.native.hardware) == null ? void 0 : _a.networkInterfaces) ?? host.native.os.hostname;
        this.hostnameAuto = this.config.hostname;
      }
    }
    const systemConfig = await this.getForeignObjectAsync("system.config");
    let countryCode = void 0;
    let languageCode = void 0;
    if (systemConfig) {
      countryCode = (0, import_i18n_iso_countries.getAlpha2Code)(systemConfig.common.country, "en");
      if ((0, import_i18n_iso_languages.isValid)(systemConfig.common.language)) {
        languageCode = systemConfig.common.language;
      }
    }
    if (this.config.country !== "iobroker") {
      countryCode = this.config.country;
    }
    try {
      const currentVersion = this.version;
      const previousVersion = this.persistentData.version ?? "";
      if (previousVersion !== currentVersion) {
        this.logger.debug(
          `Handling of adapter update - currentVersion: ${currentVersion} previousVersion: ${previousVersion}`
        );
        if ((0, import_utils.compareVersions)(previousVersion, currentVersion) < 0) {
          await (0, import_utils.handleUpdate)(this, this.logger, previousVersion);
        }
        this.persistentData.version = currentVersion;
        await this.writePersistentData();
      }
    } catch (error) {
      this.logger.error(`Handling of adapter update - Error:`, error);
    }
    let connectionType = import_eufy_security_client.P2PConnectionType.QUICKEST;
    if (this.config.p2pConnectionType === "only_local") {
      connectionType = import_eufy_security_client.P2PConnectionType.ONLY_LOCAL;
    }
    if (this.config.username !== "" && this.config.password !== "") {
      const config = {
        ...import_eufyApiCompat.eufyClientOptions,
        username: this.config.username,
        password: this.config.password,
        country: countryCode,
        language: languageCode,
        persistentData: persistentDriverData,
        eventDurationSeconds: this.config.eventDuration,
        p2pConnectionSetup: connectionType,
        pollingIntervalMinutes: this.config.pollingInterval,
        acceptInvitations: this.config.acceptInvitations,
        logging: {
          level: this.log.level === "silly" ? import_eufy_security_client.LogLevel.Trace : this.log.level === "debug" ? import_eufy_security_client.LogLevel.Debug : this.log.level === "info" ? import_eufy_security_client.LogLevel.Info : this.log.level === "warn" ? import_eufy_security_client.LogLevel.Warn : this.log.level === "error" ? import_eufy_security_client.LogLevel.Error : import_eufy_security_client.LogLevel.Info
        }
      };
      (0, import_eufyApiCompat.keepStationsConnected)((0, import_eufyApiCompat.parseSerialList)(this.config.keepConnectedStations));
      (0, import_eufyApiCompat.applyEufyApiCompatibility)((message) => this.logger.info(message));
      const grace = this.config.pictureStartupGrace ?? 0;
      this.pictureGraceUntil = grace > 0 ? Date.now() + grace * 1e3 : 0;
      this.eufy = await import_eufy_security_client.EufySecurity.initialize(config, this.logger);
      this.eufy.on("persistent data", (data) => this.onPersistentData(data));
      this.eufy.on("station added", (station) => this.onStationAdded(station));
      this.eufy.on("device added", (device) => this.onDeviceAdded(device));
      this.eufy.on("station removed", (station) => this.onStationRemoved(station));
      this.eufy.on("device removed", (device) => this.onDeviceRemoved(device));
      this.eufy.on("push connect", () => this.onPushConnect());
      this.eufy.on("push close", () => this.onPushClose());
      this.eufy.on("mqtt connect", () => this.onMQTTConnect());
      this.eufy.on("mqtt close", () => this.onMQTTClose());
      this.eufy.on("connect", () => this.onConnect());
      this.eufy.on("close", () => this.onClose());
      this.eufy.on(
        "device property changed",
        (device, name, value) => this.onDevicePropertyChanged(device, name, value)
      );
      this.eufy.on(
        "station command result",
        (station, result) => this.onStationCommandResult(station, result)
      );
      this.eufy.on(
        "station livestream start",
        (station, device, metadata, videostream, audiostream) => this.onStationLivestreamStart(station, device, metadata, videostream, audiostream)
      );
      this.eufy.on(
        "station livestream stop",
        (station, device) => this.onStationLivestreamStop(station, device)
      );
      this.eufy.on(
        "station rtsp url",
        (station, device, value) => this.onStationRTSPUrl(station, device, value)
      );
      this.eufy.on(
        "station property changed",
        (station, name, value) => this.onStationPropertyChanged(station, name, value)
      );
      this.eufy.on("station connect", (station) => this.onStationConnect(station));
      this.eufy.on("station close", (station) => this.onStationClose(station));
      this.eufy.on("tfa request", () => this.onTFARequest());
      this.eufy.on(
        "captcha request",
        (captchaId, captcha) => this.onCaptchaRequest(captchaId, captcha)
      );
      this.eufy.setCameraMaxLivestreamDuration(
        this.config.maxLivestreamDuration > 0 ? this.config.maxLivestreamDuration + LIVESTREAM_START_ALLOWANCE : 0
      );
      await this.eufy.connect();
      if (import_go2rtc_static.default) {
        const go2rtcConfig = {
          api: {
            listen: `:${this.config.go2rtc_api_port}`,
            // The livestream player has to be served by go2rtc itself: go2rtc
            // answers a WebSocket from a different origin with "403 Forbidden",
            // so a page delivered by the web adapter could not play anything.
            static_dir: path.join(__dirname, "..", "www")
          },
          rtsp: {
            listen: `:${this.config.go2rtc_rtsp_port}`
          },
          srtp: {
            listen: `:${this.config.go2rtc_srtp_port}`
          },
          webrtc: {
            listen: `:${this.config.go2rtc_webrtc_port}`
          },
          ffmpeg: {
            bin: import_ffmpeg_for_homebridge.default !== "" && import_ffmpeg_for_homebridge.default !== void 0 ? import_ffmpeg_for_homebridge.default : "ffmpeg"
          },
          streams: {}
        };
        if (this.config.go2rtc_rtsp_username !== "" && this.config.go2rtc_rtsp_password !== "") {
          go2rtcConfig.rtsp.username = this.config.go2rtc_rtsp_username;
          go2rtcConfig.rtsp.password = this.config.go2rtc_rtsp_password;
        }
        if (this.config.livestreamOnDemand) {
          const stations = /* @__PURE__ */ new Map();
          const names = /* @__PURE__ */ new Map();
          for (const device of await this.eufy.getDevices()) {
            stations.set(device.getSerial(), device.getStationSerial());
            names.set(device.getSerial(), device.getName());
          }
          this.onDemand = new import_ondemand.OnDemandStreams({
            start: (serial) => this.startOnDemandLivestream(serial),
            stop: (serial) => this.stopOnDemandLivestream(serial),
            // One P2P session per station carries a single livestream: starting a
            // second device of the station ends the first one.
            group: (serial) => stations.get(serial),
            name: (serial) => names.get(serial),
            log: {
              debug: (message) => this.logger.debug(message),
              info: (message) => this.logger.info(message),
              warn: (message) => this.logger.warn(message)
            }
          });
          try {
            await this.onDemand.listen();
          } catch (error) {
            this.logger.error("Livestreams on demand are unavailable", error);
            this.onDemand = void 0;
          }
        }
        const compatSerials = (0, import_eufyApiCompat.parseSerialList)(this.config.compatStreamDevices);
        for (const device of await this.eufy.getDevices()) {
          const serial = device.getSerial();
          go2rtcConfig.streams[serial] = this.onDemand && device.hasCommand(import_eufy_security_client.CommandName.DeviceStartLivestream) ? this.onDemand.sources(serial) : null;
          const streamName = (0, import_go2rtc.go2rtcStreamName)(serial, compatSerials);
          if (streamName !== serial) {
            go2rtcConfig.streams[streamName] = (0, import_go2rtc.compatStreamSource)(serial);
          }
        }
        this.startGo2rtc(JSON.stringify(go2rtcConfig));
      }
    }
    try {
      await (0, import_utils.deleteEmptyUnknownChannels)(this);
    } catch (error) {
      this.logger.error("Delete empty unknown channels - Error", error);
    }
  }
  /**
   * Starts go2rtc and keeps it running. Without this, a crashed go2rtc was only reported with
   * this.log.info() and never restarted, so every livestream failed until the adapter itself was
   * restarted - at the default log level "info" the reason was not even visible.
   *
   * @param go2rtcConfig The serialized go2rtc configuration
   */
  startGo2rtc(go2rtcConfig) {
    if (!import_go2rtc_static.default || this.terminating) {
      return;
    }
    const startedAt = Date.now();
    const go2rtc = import_node_child_process.default.spawn(import_go2rtc_static.default, ["-config", go2rtcConfig], {
      shell: false,
      detached: false,
      windowsHide: true
    });
    this.go2rtcProcess = go2rtc;
    go2rtc.on("error", (error) => {
      this.log[this.terminating ? "info" : "error"](`go2rtc error: ${error}`);
    });
    go2rtc.stdout.setEncoding("utf8");
    go2rtc.stdout.on("data", (data) => {
      this.log.info(`go2rtc: ${data}`);
    });
    go2rtc.stderr.setEncoding("utf8");
    go2rtc.stderr.on("data", (data) => {
      this.log[this.terminating ? "info" : "error"](`go2rtc error: ${data}`);
    });
    go2rtc.on("close", (exitcode) => {
      this.go2rtcProcess = void 0;
      if (this.terminating) {
        this.log.info(`go2rtc terminated with exitcode ${exitcode}`);
        return;
      }
      if (Date.now() - startedAt >= GO2RTC_HEALTHY_RUNTIME) {
        this.go2rtcRestarts = 0;
      }
      const delay = Math.min(GO2RTC_RESTART_DELAY_MAX, GO2RTC_RESTART_DELAY_MIN * 2 ** this.go2rtcRestarts);
      this.go2rtcRestarts++;
      this.log.error(
        `go2rtc terminated unexpectedly with exitcode ${exitcode} - livestreaming is unavailable, restarting in ${delay / 1e3}s`
      );
      this.go2rtcRestartTimeout = this.setTimeout(() => {
        this.go2rtcRestartTimeout = void 0;
        this.startGo2rtc(go2rtcConfig);
      }, delay);
    });
  }
  stopGo2rtc() {
    if (this.go2rtcRestartTimeout) {
      this.clearTimeout(this.go2rtcRestartTimeout);
      this.go2rtcRestartTimeout = void 0;
    }
    if (this.go2rtcProcess) {
      this.go2rtcProcess.kill();
      this.go2rtcProcess = void 0;
    }
  }
  async writePersistentData() {
    try {
      await this.writeFileAsync(this.namespace, this.persistentFile, JSON.stringify(this.persistentData));
    } catch (error) {
      this.logger.error(`writePersistentData() - Error: ${error}`);
    }
  }
  onPersistentData(data) {
    this.writeFileAsync(this.namespace, this.persistentDriverFile, data).catch((error) => {
      this.logger.error(`writePersistentDriverData() - Error: ${error}`);
    });
  }
  /**
   * Is called when the adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback
   */
  async onUnload(callback) {
    var _a;
    try {
      this.terminating = true;
      this.stopGo2rtc();
      await ((_a = this.onDemand) == null ? void 0 : _a.close().catch(() => {
      }));
      for (const talkback of this.talkbacks.values()) {
        talkback.abort();
      }
      if (this.eufy) {
        if (this.eufy.isConnected()) {
          await this.setStateAsync("info.connection", { val: false, ack: true }).catch(() => {
          });
        }
        this.eufy.removeAllListeners();
        this.eufy.close();
      }
      callback();
    } catch (e) {
      callback();
    }
  }
  /**
   * Is called if a subscribed state changes
   *
   * @param id
   * @param state
   */
  async onStateChange(id, state) {
    if (state) {
      if (!id || state.ack) {
        this.logger.debug(
          `state ${id} changed: ${state.val} (ack = ${state.ack}) was already acknowledged, ignore it...`
        );
        return;
      }
      this.logger.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      const values = id.split(".");
      const station_sn = values[2];
      const device_type = values[3];
      if (station_sn == "verify_code") {
        if (this.eufy && this.verify_code) {
          this.logger.info(`Verification code received, send it. (verify_code: ${state.val})`);
          await this.eufy.connect({ verifyCode: state.val });
          this.verify_code = false;
          await this.delStateAsync(id);
        }
      } else if (station_sn == "captcha") {
        if (this.eufy && this.captchaId) {
          this.logger.info(`Captcha received, send it. (captcha: ${state.val})`);
          await this.eufy.connect({
            captcha: {
              captchaCode: state.val,
              captchaId: this.captchaId
            }
          });
          this.captchaId = null;
          await this.delStateAsync(id);
          await this.delStateAsync("received_captcha_html");
        }
      } else if (device_type == "station") {
        try {
          const station_state_name = values[4];
          if (this.eufy) {
            const obj = await this.getObjectAsync(id);
            if (obj) {
              if (obj.native.name !== void 0) {
                await this.eufy.setStationProperty(station_sn, obj.native.name, state.val);
                return;
              }
            }
            const station = await this.eufy.getStation(station_sn);
            switch (station_state_name) {
              case import_types.StationStateID.REBOOT:
                station.rebootHUB();
                break;
              case import_types.StationStateID.TRIGGER_ALARM_SOUND:
                station.triggerStationAlarmSound(this.config.alarmSoundDuration);
                break;
              case import_types.StationStateID.RESET_ALARM_SOUND:
                station.resetStationAlarmSound();
                break;
            }
          }
        } catch (error) {
          this.logger.error(`station - Error:`, error);
        }
      } else {
        try {
          const device_sn = values[4];
          const obj = await this.getObjectAsync(id);
          if (obj) {
            if (obj.native.name !== void 0) {
              try {
                await this.eufy.setDeviceProperty(
                  device_sn,
                  obj.native.name,
                  obj.common.type === "object" ? JSON.parse(state.val) : state.val
                );
              } catch (error) {
                this.logger.error(
                  `Error in setting property value (property: ${obj.native.name} value: ${state.val})`,
                  error
                );
              }
              return;
            }
          }
          const device_state_name = values[5];
          const station = await this.eufy.getStation(station_sn);
          const device = await this.eufy.getDevice(device_sn);
          switch (device_state_name) {
            case import_types.DeviceStateID.START_STREAM:
              await this.startLivestream(device_sn);
              break;
            case import_types.DeviceStateID.STOP_STREAM:
              await this.stopLivestream(device_sn);
              break;
            case import_types.DeviceStateID.TALKBACK_PLAY:
              void this.playTalkback(device_sn, state.val, id);
              break;
            case import_types.DeviceStateID.TRIGGER_ALARM_SOUND:
              station.triggerDeviceAlarmSound(device, this.config.alarmSoundDuration);
              break;
            case import_types.DeviceStateID.RESET_ALARM_SOUND:
              station.resetDeviceAlarmSound(device);
              break;
            case import_types.DeviceStateID.ROTATE_360:
              station.panAndTilt(device, import_eufy_security_client.PanTiltDirection.ROTATE360);
              break;
            case import_types.DeviceStateID.PAN_LEFT:
              station.panAndTilt(device, import_eufy_security_client.PanTiltDirection.LEFT);
              break;
            case import_types.DeviceStateID.PAN_RIGHT:
              station.panAndTilt(device, import_eufy_security_client.PanTiltDirection.RIGHT);
              break;
            case import_types.DeviceStateID.TILT_UP:
              station.panAndTilt(device, import_eufy_security_client.PanTiltDirection.UP);
              break;
            case import_types.DeviceStateID.TILT_DOWN:
              station.panAndTilt(device, import_eufy_security_client.PanTiltDirection.DOWN);
              break;
            case import_types.DeviceStateID.PRESET_POSITION:
              station.presetPosition(device, state.val);
              break;
            case import_types.DeviceStateID.SAVE_PRESET_POSITION:
              station.savePresetPosition(device, state.val);
              break;
            case import_types.DeviceStateID.DELETE_PRESET_POSITION:
              station.deletePresetPosition(device, state.val);
              break;
            case import_types.DeviceStateID.CALIBRATE:
              if (device.isLock()) {
                station.calibrateLock(device);
              } else {
                station.calibrate(device);
              }
              break;
            case import_types.DeviceStateID.UNLOCK:
              station.unlock(device);
              break;
            case import_types.DeviceStateID.SET_DEFAULT_ANGLE:
              station.setDefaultAngle(device);
              break;
            case import_types.DeviceStateID.SET_PRIVACY_ANGLE:
              station.setPrivacyAngle(device);
              break;
            case import_types.DeviceStateID.OPEN_BOX:
              station.open(device);
              break;
          }
        } catch (error) {
          this.logger.error(`cameras - Error:`, error);
        }
      }
    } else {
      this.logger.debug(`state ${id} deleted`);
    }
  }
  /**
   * Some message was sent to this instance over the message box. Used by email, pushover, text2speech, ...
   * Using this method requires the "common.message" property to be set to true in io-package.json
   *
   * @param obj
   */
  async onMessage(obj) {
    if (typeof obj === "object" && obj.command === STREAM_OVERVIEW_COMMAND) {
      const result = (0, import_overview.renderStreamOverview)(await this.collectStreams(), {
        language: this.language ?? "en",
        onDemand: this.onDemand !== void 0,
        hostnameAuto: this.hostnameAuto,
        noGo2rtc: !import_go2rtc_static.default
      });
      if (obj.callback) {
        this.sendTo(obj.from, obj.command, result, obj.callback);
      }
      return;
    }
    if (typeof obj === "object" && obj.message) {
      const response = await (0, import_messages.handleMessage)(this.eufy, obj.command, obj.message, this.log);
      if (obj.callback) {
        this.sendTo(obj.from, obj.command, response, obj.callback);
      }
    }
  }
  /**
   * Collects every device with a livestream and the URLs it is played at.
   *
   * @returns The devices, empty while the adapter is not connected to eufy
   */
  async collectStreams() {
    if (!this.eufy) {
      return [];
    }
    const compatSerials = (0, import_eufyApiCompat.parseSerialList)(this.config.compatStreamDevices);
    const streams = [];
    try {
      for (const device of await this.eufy.getDevices()) {
        if (!device.hasCommand(import_eufy_security_client.CommandName.DeviceStartLivestream)) {
          continue;
        }
        const serial = device.getSerial();
        const station = await this.eufy.getStation(device.getStationSerial()).catch(() => void 0);
        const streamName = (0, import_go2rtc.go2rtcStreamName)(serial, compatSerials);
        streams.push({
          serial,
          name: device.getName(),
          model: device.getModel(),
          station: (station == null ? void 0 : station.getName()) ?? device.getStationSerial(),
          playerUrl: (0, import_go2rtc.buildPlayerUrl)(this.config.hostname, this.config.go2rtc_api_port, streamName),
          rtspUrl: (0, import_go2rtc.buildRtspUrl)(this.config.hostname, this.config.go2rtc_rtsp_port, streamName),
          originalPlayerUrl: streamName !== serial ? (0, import_go2rtc.buildPlayerUrl)(this.config.hostname, this.config.go2rtc_api_port, serial) : void 0
        });
      }
    } catch (error) {
      this.logger.debug("Streams overview - Error", error);
    }
    return streams;
  }
  getStateCommon(property) {
    const state = {
      name: property.label,
      type: property.type,
      role: "state",
      read: property.readable,
      write: property.writeable,
      def: property.type === "object" && typeof property.default === "object" ? JSON.stringify(property.default) : property.default
    };
    switch (property.type) {
      case "number": {
        const numberProperty = property;
        state.min = numberProperty.min;
        state.max = numberProperty.max;
        state.states = numberProperty.states;
        state.unit = numberProperty.unit;
        state.step = numberProperty.steps;
        state.role = import_types.RoleMapping[property.name] !== void 0 ? import_types.RoleMapping[property.name] : "value";
        break;
      }
      case "string": {
        state.role = import_types.RoleMapping[property.name] !== void 0 ? import_types.RoleMapping[property.name] : "text";
        break;
      }
      case "boolean": {
        state.role = import_types.RoleMapping[property.name] !== void 0 ? import_types.RoleMapping[property.name] : property.writeable ? "switch.enable" : "state";
        break;
      }
    }
    return state;
  }
  async createAndSetState(device, property) {
    if (property.name !== import_eufy_security_client.PropertyName.Type && property.name !== import_eufy_security_client.PropertyName.DeviceStationSN) {
      const state = this.getStateCommon(property);
      const id = device.getStateID((0, import_utils.convertCamelCaseToSnakeCase)(property.name));
      const obj = await this.getObjectAsync(id);
      if (obj) {
        let changed = false;
        if (obj.native.name !== void 0 && obj.native.name !== property.name) {
          obj.native.name = property.name;
          changed = true;
        }
        if (obj.native.key !== void 0 && obj.native.key !== property.key) {
          obj.native.key = property.key;
          changed = true;
        }
        if (obj.native.commandId !== void 0 && obj.native.commandId !== property.commandId) {
          obj.native.commandId = property.commandId;
          changed = true;
        }
        if (obj.common !== void 0 && (0, import_utils.commonChanged)(obj.common, state)) {
          changed = true;
        }
        if (changed) {
          obj.common = state;
          await this.setObjectAsync(id, obj);
        }
      } else {
        await this.setObjectNotExistsAsync(id, {
          type: "state",
          common: state,
          native: {
            key: property.key,
            commandId: property.commandId,
            name: property.name
          }
        });
      }
      const value = device.getPropertyValue(property.name);
      if (value !== void 0) {
        await (0, import_utils.setStateChangedAsync)(this, id, (0, import_utils.toStateValue)(property.type, value));
      }
    }
  }
  async onDeviceAdded(device) {
    this.logger.debug(`onDeviceAdded - device: ${device.getSerial()}`);
    await this.setObjectNotExistsAsync(device.getStateID("", 0), {
      type: "channel",
      common: {
        name: device.getStateChannel()
      },
      native: {}
    });
    await this.setObjectNotExistsAsync(device.getStateID("", 1), {
      type: "device",
      common: {
        name: device.getName()
      },
      native: {}
    });
    const metadata = device.getPropertiesMetadata();
    for (const property of Object.values(metadata)) {
      if (property.name !== import_eufy_security_client.PropertyName.DevicePicture) {
        await this.createAndSetState(device, property);
      }
    }
    if (device.hasProperty(import_eufy_security_client.PropertyName.DevicePicture)) {
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.PICTURE_URL), {
        type: "state",
        common: {
          name: "Picture URL",
          type: "string",
          role: "url",
          read: true,
          write: false
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.PICTURE_HTML), {
        type: "state",
        common: {
          name: "Picture HTML image",
          type: "string",
          role: "html",
          read: true,
          write: false
        },
        native: {}
      });
    }
    const buttons = [
      [import_eufy_security_client.CommandName.DeviceTriggerAlarmSound, import_types.DeviceStateID.TRIGGER_ALARM_SOUND, "Trigger Alarm Sound"],
      [import_eufy_security_client.CommandName.DeviceTriggerAlarmSound, import_types.DeviceStateID.RESET_ALARM_SOUND, "Reset Alarm Sound"],
      [import_eufy_security_client.CommandName.DevicePanAndTilt, import_types.DeviceStateID.PAN_LEFT, "Pan Left"],
      [import_eufy_security_client.CommandName.DevicePanAndTilt, import_types.DeviceStateID.PAN_RIGHT, "Pan Right"],
      [import_eufy_security_client.CommandName.DevicePanAndTilt, import_types.DeviceStateID.ROTATE_360, "Rotate 360\xB0"],
      [import_eufy_security_client.CommandName.DevicePanAndTilt, import_types.DeviceStateID.TILT_UP, "Tilt Up"],
      [import_eufy_security_client.CommandName.DevicePanAndTilt, import_types.DeviceStateID.TILT_DOWN, "Tilt Down"],
      [import_eufy_security_client.CommandName.DeviceLockCalibration, import_types.DeviceStateID.CALIBRATE, "Calibrate Lock"],
      [import_eufy_security_client.CommandName.DeviceUnlock, import_types.DeviceStateID.UNLOCK, "Unlock"],
      [import_eufy_security_client.CommandName.DeviceSetDefaultAngle, import_types.DeviceStateID.SET_DEFAULT_ANGLE, "Set Default Angle"],
      [import_eufy_security_client.CommandName.DeviceSetPrivacyAngle, import_types.DeviceStateID.SET_PRIVACY_ANGLE, "Set Privacy Angle"],
      [import_eufy_security_client.CommandName.DeviceCalibrate, import_types.DeviceStateID.CALIBRATE, "Calibrate"],
      [import_eufy_security_client.CommandName.DeviceOpen, import_types.DeviceStateID.OPEN_BOX, "Open Box"]
    ];
    for (const [command, stateId, name] of buttons) {
      if (device.hasCommand(command)) {
        await this.setObjectNotExistsAsync(device.getStateID(stateId), {
          type: "state",
          common: {
            name,
            type: "boolean",
            role: "button.start",
            read: false,
            write: true
          },
          native: {}
        });
      }
    }
    const presetPositionCommands = [
      [import_eufy_security_client.CommandName.DevicePresetPosition, import_types.DeviceStateID.PRESET_POSITION, "Move to preset position"],
      [
        import_eufy_security_client.CommandName.DeviceSavePresetPosition,
        import_types.DeviceStateID.SAVE_PRESET_POSITION,
        "Save current position as preset"
      ],
      [import_eufy_security_client.CommandName.DeviceDeletePresetPosition, import_types.DeviceStateID.DELETE_PRESET_POSITION, "Delete preset position"]
    ];
    for (const [command, stateId, name] of presetPositionCommands) {
      if (device.hasCommand(command)) {
        await this.setObjectNotExistsAsync(device.getStateID(stateId), {
          type: "state",
          common: {
            name,
            type: "number",
            role: "level",
            read: false,
            write: true,
            states: {
              [import_eufy_security_client.PresetPositionType.PRESET_1]: "Preset 1",
              [import_eufy_security_client.PresetPositionType.PRESET_2]: "Preset 2",
              [import_eufy_security_client.PresetPositionType.PRESET_3]: "Preset 3",
              [import_eufy_security_client.PresetPositionType.PRESET_4]: "Preset 4"
            }
          },
          native: {}
        });
      }
    }
    if (device.hasCommand(import_eufy_security_client.CommandName.DeviceStartTalkback)) {
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.TALKBACK_PLAY), {
        type: "state",
        common: {
          name: "Play audio through the speaker (http(s) URL or absolute file path)",
          type: "string",
          role: "text",
          read: true,
          write: true
        },
        native: {}
      });
    }
    if (device.hasCommand(import_eufy_security_client.CommandName.DeviceStartLivestream)) {
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.START_STREAM), {
        type: "state",
        common: {
          name: "Start stream",
          type: "boolean",
          role: "button.start",
          read: false,
          write: true
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.STOP_STREAM), {
        type: "state",
        common: {
          name: "Stop stream",
          type: "boolean",
          role: "button.stop",
          read: false,
          write: true
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.LIVESTREAM), {
        type: "state",
        common: {
          name: "Livestream URL",
          type: "string",
          role: "url",
          read: true,
          write: false
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.LIVESTREAM_RTSP), {
        type: "state",
        common: {
          name: "Livestream RTSP URL",
          type: "string",
          role: "url",
          read: true,
          write: false
        },
        native: {}
      });
      await this.setLivestreamStates(device, this.config.livestreamOnDemand);
    }
    if (device.hasProperty(import_eufy_security_client.PropertyName.DeviceRTSPStream)) {
      await this.setObjectNotExistsAsync(device.getStateID(import_types.DeviceStateID.RTSP_STREAM_URL), {
        type: "state",
        common: {
          name: "RTSP stream URL",
          type: "string",
          role: "url",
          read: true,
          write: false
        },
        native: {}
      });
    }
  }
  onDeviceRemoved(device) {
    this.delObjectAsync(device.getStateID("", 0), { recursive: true }).catch((error) => {
      this.logger.error(`Error deleting states of removed device`, error);
    });
    (0, import_utils.removeFiles)(
      this,
      device.getStationSerial(),
      import_types.DataLocation.LAST_EVENT,
      device.getSerial()
    ).catch((error) => {
      this.logger.error(`Error deleting fs contents of removed device`, error);
    });
  }
  async onStationAdded(station) {
    this.subscribeStates(`${station.getStateID("", 0)}.*`);
    const dataWait = this.config.livestreamDataWait ?? LIVESTREAM_DATA_WAIT_DEFAULT;
    if (dataWait > 0) {
      station.setStreamTimeouts({ streamDataWait: dataWait * 1e3 });
    }
    await this.setObjectNotExistsAsync(station.getStateID("", 0), {
      type: "device",
      common: {
        name: station.getName()
      },
      native: {}
    });
    await this.setObjectNotExistsAsync(station.getStateID("", 1), {
      type: "channel",
      common: {
        name: station.getStateChannel()
      },
      native: {}
    });
    await this.setObjectNotExistsAsync(station.getStateID(import_types.StationStateID.CONNECTION), {
      type: "state",
      common: {
        name: "Connection",
        type: "boolean",
        role: "indicator.connection",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setStateAsync(station.getStateID(import_types.StationStateID.CONNECTION), { val: false, ack: true });
    const metadata = station.getPropertiesMetadata();
    for (const property of Object.values(metadata)) {
      await this.createAndSetState(station, property);
    }
    if (station.hasCommand(import_eufy_security_client.CommandName.StationReboot)) {
      await this.setObjectNotExistsAsync(station.getStateID(import_types.StationStateID.REBOOT), {
        type: "state",
        common: {
          name: "Reboot station",
          type: "boolean",
          role: "button.start",
          read: false,
          write: true
        },
        native: {}
      });
    }
    if (station.hasCommand(import_eufy_security_client.CommandName.StationTriggerAlarmSound)) {
      await this.setObjectNotExistsAsync(station.getStateID(import_types.StationStateID.TRIGGER_ALARM_SOUND), {
        type: "state",
        common: {
          name: "Trigger Alarm Sound",
          type: "boolean",
          role: "button.start",
          read: false,
          write: true
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(station.getStateID(import_types.StationStateID.RESET_ALARM_SOUND), {
        type: "state",
        common: {
          name: "Reset Alarm Sound",
          type: "boolean",
          role: "button.start",
          read: false,
          write: true
        },
        native: {}
      });
    }
  }
  onStationRemoved(station) {
    this.delObjectAsync(station.getStateID("", 0), { recursive: true }).catch((error) => {
      this.logger.error(`Error deleting states of removed station`, error);
    });
    this.delFileAsync(this.namespace, station.getSerial()).catch((error) => {
      this.logger.error(`Error deleting fs contents of removed station`, error);
    });
  }
  async onConnect() {
    var _a;
    await this.setStateAsync("info.connection", { val: true, ack: true });
    const stations = await this.eufy.getStations();
    const stationSerials = [];
    for (const station of stations) {
      stationSerials.push(station.getSerial());
    }
    const devices = await this.eufy.getDevices();
    const deviceSerials = [];
    for (const device of devices) {
      deviceSerials.push(device.getSerial());
    }
    try {
      const allDevices = await this.getDevicesAsync();
      const reg = new RegExp(`^${this.namespace}\\.[0-9A-Z]+$`);
      for (const id of allDevices) {
        if (id._id.match(reg)) {
          const serial = id._id.replace(`${this.namespace}.`, "");
          if (!stationSerials.includes(serial)) {
            await this.delObjectAsync(id._id, { recursive: true });
          }
        }
      }
    } catch (error) {
      this.logger.error("Delete obsolete stations ERROR", error);
    }
    try {
      const allDevices = await this.getDevicesAsync();
      const reg = new RegExp(`^${this.namespace}\\.[0-9A-Z]+\\.[a-z]+\\.[0-9A-Z]+$`);
      for (const id of allDevices) {
        if (id._id.match(reg)) {
          const values = id._id.split(".");
          const stateChannel = values[3];
          const serial = values[4];
          if (!deviceSerials.includes(serial) || deviceSerials.includes(serial) && devices[deviceSerials.indexOf(serial)].getStateChannel() !== "unknown" && stateChannel === "unknown") {
            await this.delObjectAsync(id._id, { recursive: true });
          }
        }
      }
    } catch (error) {
      this.logger.error("Delete obsolete devices ERROR", error);
    }
    try {
      const objects = await this.getAdapterObjectsAsync();
      for (const [stateid, object] of Object.entries(objects)) {
        const propertyName = (_a = object.native) == null ? void 0 : _a.name;
        const tmp = stateid.split(".");
        if (object.type !== "state" || typeof propertyName !== "string" || tmp.length < 5) {
          continue;
        }
        const stationSerial = tmp[2];
        const deviceSerial = tmp[4];
        try {
          const owner = deviceSerial.match(/^[A-Z0-9]+/) ? await this.eufy.getDevice(deviceSerial) : await this.eufy.getStation(stationSerial);
          if (!owner.hasProperty(propertyName)) {
            await this.delObjectAsync(stateid);
          }
        } catch (error) {
          if (!(error instanceof import_eufy_security_client.DeviceNotFoundError) && !(error instanceof import_eufy_security_client.StationNotFoundError)) {
            this.logger.error("Delete obsolete properties ERROR", error);
          }
        }
      }
    } catch (error) {
      this.logger.error("Delete obsolete properties ERROR", error);
    }
    try {
      const contents = await this.readDirAsync(this.namespace, "");
      for (const content of contents.filter((fn) => fn.file.match("^T[0-9A-Z]+$") !== null && fn.isDir)) {
        if (!stationSerials.includes(content.file)) {
          await this.delFileAsync(this.namespace, content.file);
        } else {
          const dirContents = await this.readDirAsync(this.namespace, content.file);
          for (const dir of dirContents.filter(
            (fn) => Object.values(import_types.DataLocation).includes(fn.file) && fn.isDir
          )) {
            const files = await this.readDirAsync(this.namespace, path.join(content.file, dir.file));
            let deletedFiles = 0;
            for (const file of files.filter(
              (fn) => !deviceSerials.includes(fn.file.substring(0, 16)) && !fn.isDir
            )) {
              await this.delFileAsync(this.namespace, path.join(content.file, dir.file, file.file));
              deletedFiles++;
            }
            if (deletedFiles === files.length) {
              await this.delFileAsync(this.namespace, path.join(content.file, dir.file));
            }
          }
        }
      }
    } catch (error) {
      this.log.error(`Delete obsolete directories/files ERROR - ${error}`);
    }
  }
  async onClose() {
    await this.setStateAsync("info.connection", { val: false, ack: true }).catch(() => {
    });
  }
  async onPushConnect() {
    await this.setStateAsync("info.push_connection", { val: true, ack: true }).catch(() => {
    });
  }
  async onPushClose() {
    await this.setStateAsync("info.push_connection", { val: false, ack: true }).catch(() => {
    });
  }
  async onMQTTConnect() {
    await this.setStateAsync("info.mqtt_connection", { val: true, ack: true }).catch(() => {
    });
  }
  async onMQTTClose() {
    await this.setStateAsync("info.mqtt_connection", { val: false, ack: true }).catch(() => {
    });
  }
  onStationCommandResult(station, result) {
    if (result.return_code !== 0 && result.command_type !== import_eufy_security_client.CommandType.P2P_QUERY_STATUS_IN_LOCK && result.command_type !== import_eufy_security_client.CommandType.CMD_STORAGE_INFO_HB3 && result.command_type !== import_eufy_security_client.CommandType.CMD_SDINFO_EX || result.return_code !== 0 && result.return_code !== import_eufy_security_client.ErrorCode.ERROR_DEV_BUSY && result.command_type === import_eufy_security_client.CommandType.CMD_STORAGE_INFO_HB3) {
      this.logger.error(
        `Station: ${station.getSerial()} command ${import_eufy_security_client.CommandType[result.command_type]} failed with error: ${import_eufy_security_client.ErrorCode[result.return_code]} (${result.return_code})`
      );
    } else if (result.return_code !== 0 && result.return_code !== import_eufy_security_client.TFCardStatus.REMOVE && result.return_code !== import_eufy_security_client.TFCardStatus.BUSY && result.command_type === import_eufy_security_client.CommandType.CMD_SDINFO_EX) {
      this.logger.error(
        `Station: ${station.getSerial()} command ${import_eufy_security_client.CommandType[result.command_type]} failed with error: ${import_eufy_security_client.TFCardStatus[result.return_code]} (${result.return_code})`
      );
    }
  }
  async onStationPropertyChanged(station, name, value) {
    if (!await (0, import_utils.setPropertyState)(this, station.getStateID((0, import_utils.convertCamelCaseToSnakeCase)(name)), name, value)) {
      this.logger.debug(
        `onStationPropertyChanged(): Property "${name}" not implemented in this adapter (station: ${station.getSerial()} value: ${JSON.stringify(value)})`
      );
    }
  }
  /**
   * ahlers2mi: Entscheidet, ob fuer ein neues Kamerabild picture_url/picture_html geschrieben
   * werden. Rueckgabe undefined = schreiben, sonst der Grund fuer das Auslassen (fuers Log).
   *
   * Vier Faelle werden ausgelassen:
   *   - kein frisches Ereignis: das Bild gehoert zu keiner Erkennung, die gerade gemeldet
   *     wurde. Nur der Push-Weg liefert ein Bild zu einem laufenden Ereignis, und der setzt
   *     immer motionDetected/personDetected/ringing mit. Alles andere ist Nachgereichtes.
   *   - Startphase: dasselbe fuer die Zeit direkt nach dem Start, falls die
   *     Ereignispruefung abgeschaltet ist.
   *   - gleiches Bild: Bild-Inhalt identisch mit dem zuletzt gemeldeten.
   *   - Nachschlag: ein Ereignis liefert erst das Cloud-Vorschaubild und Sekunden spaeter
   *     den P2P-Ausschnitt; das zweite faellt weg.
   *
   * @param device Kamera
   * @param picture neues Bild
   */
  suppressPictureStates(device, picture) {
    const now = Date.now();
    const serial = device.getSerial();
    const hash = (0, import_node_crypto.createHash)("sha1").update(picture.data).digest("hex");
    const previous = this.lastPicture.get(serial);
    const eventWindow = (this.config.pictureEventWindow ?? 180) * 1e3;
    if (eventWindow > 0) {
      const event = this.lastEvent.get(serial);
      if (event === void 0 || now - event > eventWindow) {
        this.lastPicture.set(serial, { hash, time: now });
        const age = event === void 0 ? "none in this run" : `${Math.round((now - event) / 1e3)}s ago`;
        return `no recent detection for this camera (${age})`;
      }
    }
    if (this.pictureGraceUntil > now) {
      this.lastPicture.set(serial, { hash, time: now });
      return `startup grace period, ${Math.round((this.pictureGraceUntil - now) / 1e3)}s left`;
    }
    if (previous !== void 0) {
      if (previous.hash === hash) {
        return "same picture as before";
      }
      const configured = this.config.pictureMinInterval ?? 10;
      const minInterval = configured * 1e3;
      if (minInterval > 0 && now - previous.time < minInterval) {
        return `previous picture published ${Math.round((now - previous.time) / 1e3)}s ago, minimum interval is ${configured}s`;
      }
    }
    this.lastPicture.set(serial, { hash, time: now });
    return void 0;
  }
  async onDevicePropertyChanged(device, name, value) {
    if (value === true && (name.endsWith("Detected") || name === import_eufy_security_client.PropertyName.DeviceRinging)) {
      this.lastEvent.set(device.getSerial(), Date.now());
    }
    if (await (0, import_utils.setPropertyState)(this, device.getStateID((0, import_utils.convertCamelCaseToSnakeCase)(name)), name, value)) {
      if (name === import_eufy_security_client.PropertyName.DeviceRTSPStream && value === false) {
        await this.setStateAsync(device.getStateID(import_types.DeviceStateID.RTSP_STREAM_URL), { val: "", ack: true });
      }
      return;
    }
    if (name === import_eufy_security_client.PropertyName.DevicePicture) {
      try {
        const picture = value;
        const ext = (0, import_picture.getPictureExtension)(picture);
        if (ext === void 0) {
          const station = await this.eufy.getStation(device.getStationSerial());
          const description = (0, import_picture.describePictureData)(picture == null ? void 0 : picture.data);
          if ((0, import_picture.schedulePictureOverP2P)(
            station,
            device,
            this.p2pPictureRequests,
            (callback, ms) => this.setTimeout(callback, ms)
          )) {
            this.logger.info(
              `Event picture of device ${device.getSerial()} could not be decoded (${description}), loading it from the station`
            );
          } else {
            this.logger.warn(
              `Event picture of device ${device.getSerial()} could not be decoded, keeping the previous picture (${description})`
            );
          }
          return;
        }
        const fileName = `${device.getSerial()}.${ext}`;
        const filePath = path.join(device.getStationSerial(), import_types.DataLocation.LAST_EVENT);
        if (!await this.fileExistsAsync(this.namespace, filePath)) {
          await this.mkdirAsync(this.namespace, filePath);
        }
        await this.writeFileAsync(this.namespace, path.join(filePath, fileName), picture.data);
        const suppressed = this.suppressPictureStates(device, picture);
        if (suppressed !== void 0) {
          this.logger.debug(
            `onDevicePropertyChanged - Property picture - ${device.getSerial()}: file written, states left untouched (${suppressed})`
          );
          return;
        }
        await this.setStateAsync(
          device.getStateID(import_types.DeviceStateID.PICTURE_URL),
          `/files/${this.namespace}/${device.getStationSerial()}/${import_types.DataLocation.LAST_EVENT}/${fileName}`,
          true
        );
        await (0, import_utils.setStateChangedAsync)(
          this,
          device.getStateID(import_types.DeviceStateID.PICTURE_HTML),
          (0, import_utils.getImageAsHTML)(picture.data, picture.type.mime)
        );
      } catch (err) {
        const error = (0, import_eufy_security_client.ensureError)(err);
        this.logger.error("onDevicePropertyChanged - Property picture - Error", error);
      }
    } else {
      this.logger.debug(
        `onDevicePropertyChanged(): Property "${name}" not implemented in this adapter (device: ${device.getSerial()} value: ${JSON.stringify(value)})`
      );
    }
  }
  /**
   * Reads the streaming quality of a device: the states of the property and its current value.
   *
   * @param device The device
   * @returns The states and the value, or undefined if the device has no streaming quality
   */
  getVideoStreamingQuality(device) {
    if (!device.hasProperty(import_eufy_security_client.PropertyName.DeviceVideoStreamingQuality)) {
      return void 0;
    }
    const metadata = device.getPropertyMetadata(
      import_eufy_security_client.PropertyName.DeviceVideoStreamingQuality
    );
    return {
      states: metadata == null ? void 0 : metadata.states,
      value: device.getPropertyValue(import_eufy_security_client.PropertyName.DeviceVideoStreamingQuality)
    };
  }
  /**
   * Sets the streaming quality of a device to the one of the setting "Livestream quality" before
   * its livestream starts.
   *
   * @param device The device whose livestream starts
   * @returns true if the setting decides the quality, so the "Auto" hint does not apply
   */
  async enforceVideoStreamingQuality(device) {
    try {
      const quality = this.getVideoStreamingQuality(device);
      if (!quality) {
        return false;
      }
      const change = (0, import_quality.resolveStreamingQuality)(quality.states, quality.value, this.config.livestreamQuality);
      if (change.kind === "unavailable") {
        if (!this.qualityHints.has(`${device.getSerial()}:unavailable`)) {
          this.qualityHints.add(`${device.getSerial()}:unavailable`);
          this.logger.warn(
            `Device ${device.getSerial()} offers no streaming quality "${change.wanted}" (${(0, import_quality.fixedStreamingQualities)(quality.states)}) - the setting "Livestream quality" is ignored for it`
          );
        }
        return false;
      }
      if (change.kind === "keep") {
        return import_quality.LIVESTREAM_QUALITY_LABELS[this.config.livestreamQuality] !== void 0;
      }
      await this.eufy.setDeviceProperty(
        device.getSerial(),
        import_eufy_security_client.PropertyName.DeviceVideoStreamingQuality,
        change.value
      );
      this.logger.info(
        `Device ${device.getSerial()}: setting the streaming quality from "${change.from}" to "${change.to}" (setting "Livestream quality")`
      );
      return true;
    } catch (error) {
      this.logger.warn(`Device ${device.getSerial()} - Could not set the streaming quality`, error);
      return false;
    }
  }
  /**
   * Warns once per device, quality and run when a livestream starts at an "Auto" streaming
   * quality, where the camera is free to change the resolution mid-stream.
   *
   * Measured on a T84A1: 2048x1536 -> 800x600 -> 1600x1200 within 20 seconds. Every switch is a
   * new SPS, and go2rtc does not hand out a new MSE init segment for it, so browsers keep
   * decoding against the old one.
   *
   * @param device The device whose livestream starts
   */
  hintVideoStreamingQuality(device) {
    var _a;
    try {
      const quality = this.getVideoStreamingQuality(device);
      const label = (_a = quality == null ? void 0 : quality.states) == null ? void 0 : _a[quality.value];
      const key = `${device.getSerial()}:${quality == null ? void 0 : quality.value}`;
      if (!quality || !(0, import_quality.isAutoStreamingQuality)(label) || this.qualityHints.has(key)) {
        return;
      }
      this.qualityHints.add(key);
      const stateId = `${this.namespace}.${device.getStateID((0, import_utils.convertCamelCaseToSnakeCase)(import_eufy_security_client.PropertyName.DeviceVideoStreamingQuality))}`;
      this.logger.warn(
        `Device ${device.getSerial()} streams at the quality "${label}": the camera then changes the resolution while the livestream runs, which browsers cannot follow - the picture turns green, shows artifacts or freezes. Set a fixed quality in ${stateId} (${(0, import_quality.fixedStreamingQualities)(quality.states)}), in the eufy app, or for all devices with the setting "Livestream quality" of the adapter.`
      );
    } catch (error) {
      this.logger.debug(`Device: ${device.getSerial()} - Could not determine the video streaming quality`, error);
    }
  }
  async startLivestream(device_sn) {
    var _a;
    try {
      const device = await this.eufy.getDevice(device_sn);
      const station = await this.eufy.getStation(device.getStationSerial());
      const busy = (_a = this.onDemand) == null ? void 0 : _a.stationBusyWith(device_sn);
      if (busy) {
        this.logger.warn(
          `The stream for the device ${device_sn} cannot be started, because station ${station.getSerial()} is busy with the livestream of ${busy}, which is being watched`
        );
        return;
      }
      if (station.isConnected() || station.isEnergySavingDevice()) {
        if (!station.isLiveStreaming(device)) {
          if (!await this.enforceVideoStreamingQuality(device)) {
            this.hintVideoStreamingQuality(device);
          }
          this.logger.info(`Starting the livestream of device ${device_sn}`);
          await this.eufy.startStationLivestream(device_sn);
        } else {
          this.logger.warn(
            `The stream for the device ${device_sn} cannot be started, because it is already streaming!`
          );
        }
      } else {
        this.logger.warn(
          `The stream for the device ${device_sn} cannot be started, because there is no connection to station ${station.getSerial()}!`
        );
      }
    } catch (error) {
      this.logger.error("Start livestream - Error", error);
    }
  }
  async stopLivestream(device_sn) {
    try {
      const device = await this.eufy.getDevice(device_sn);
      const station = await this.eufy.getStation(device.getStationSerial());
      if (device.isCamera()) {
        const camera = device;
        if (await this.eufy.isStationConnected(device.getStationSerial()) && station.isLiveStreaming(camera)) {
          await this.eufy.stopStationLivestream(device_sn);
        } else {
          this.logger.warn(
            `The stream for the device ${device_sn} cannot be stopped, because it isn't streaming!`
          );
        }
      }
    } catch (error) {
      this.logger.error("Stop livestream - Error", error);
    }
  }
  /**
   * Plays an audio file or URL through the speaker of a device. Starts a livestream first if none
   * is running, because the library only allows talkback during one, and stops it again afterwards.
   *
   * @param device_sn The serial number of the device
   * @param value What was written to the talkback_play state
   * @param stateId The id of that state, acknowledged when the audio was played
   */
  async playTalkback(device_sn, value, stateId) {
    var _a;
    const source = (0, import_talkback.parseTalkbackSource)(value);
    if (source === void 0) {
      this.logger.warn(
        `Talkback for device ${device_sn}: "${String(value)}" is neither an http(s) URL nor an absolute file path.`
      );
      return;
    }
    if (this.talkbacks.has(device_sn)) {
      this.logger.warn(`Talkback for device ${device_sn} is already playing - "${source}" is ignored.`);
      return;
    }
    const talkback = new AbortController();
    this.talkbacks.set(device_sn, talkback);
    let startedLivestream = false;
    let startedTalkback = false;
    let device;
    let station;
    try {
      device = await this.eufy.getDevice(device_sn);
      station = await this.eufy.getStation(device.getStationSerial());
      if (!station.isLiveStreaming(device)) {
        const livestreamStarted = (0, import_talkback.waitForDeviceEvent)(this.eufy, "station livestream start", device_sn, 3e4);
        startedLivestream = true;
        await this.startLivestream(device_sn);
        await livestreamStarted;
      }
      const talkbackStarted = (0, import_talkback.waitForDeviceEvent)(this.eufy, "station talkback start", device_sn, 15e3);
      await this.eufy.startStationTalkback(device_sn);
      const [, , talkbackStream] = await talkbackStarted;
      startedTalkback = true;
      this.logger.info(`Talkback for device ${device_sn}: playing "${source}"...`);
      await (0, import_talkback.pipeToTalkback)(
        import_ffmpeg_for_homebridge.default || "ffmpeg",
        (0, import_talkback.talkbackFfmpegArgs)(source),
        talkbackStream,
        talkback.signal
      );
      await this.setStateAsync(stateId, { val: source, ack: true });
    } catch (error) {
      this.logger.error(`Talkback for device ${device_sn} - Error`, error);
    } finally {
      this.talkbacks.delete(device_sn);
      const stopDeferred = this.stopsAfterTalkback.delete(device_sn) && !((_a = this.onDemand) == null ? void 0 : _a.isWatched(device_sn));
      if (!this.terminating && device && (station == null ? void 0 : station.isLiveStreaming(device))) {
        if (startedTalkback) {
          await this.eufy.stopStationTalkback(device_sn).catch((error) => {
            this.logger.error(`Talkback for device ${device_sn} - Error during stopping talkback`, error);
          });
        }
        if (startedLivestream || stopDeferred) {
          await this.stopLivestream(device_sn);
        }
      }
    }
  }
  /**
   * Starts counting the maximum livestream duration of a device at its first picture.
   *
   * @param device_sn The serial number of the device
   */
  startLivestreamTimeout(device_sn) {
    this.clearLivestreamTimeout(device_sn);
    const seconds = this.config.maxLivestreamDuration;
    if (!(seconds > 0)) {
      return;
    }
    this.livestreamTimeouts.set(
      device_sn,
      this.setTimeout(() => {
        this.livestreamTimeouts.delete(device_sn);
        this.logger.info(
          `Stopping the livestream of device ${device_sn}, because it reached the maximum duration of ${seconds} seconds since the first picture`
        );
        void this.stopLivestream(device_sn);
      }, seconds * 1e3)
    );
  }
  clearLivestreamTimeout(device_sn) {
    const timeout = this.livestreamTimeouts.get(device_sn);
    if (timeout) {
      this.clearTimeout(timeout);
    }
    this.livestreamTimeouts.delete(device_sn);
  }
  /**
   * Sets the livestream states of a device to the URLs of its go2rtc stream, or clears them.
   *
   * @param device The device
   * @param available Whether the stream can be played
   */
  async setLivestreamStates(device, available) {
    const streamName = (0, import_go2rtc.go2rtcStreamName)(device.getSerial(), (0, import_eufyApiCompat.parseSerialList)(this.config.compatStreamDevices));
    await this.setStateAsync(device.getStateID(import_types.DeviceStateID.LIVESTREAM), {
      val: available ? (0, import_go2rtc.buildPlayerUrl)(this.config.hostname, this.config.go2rtc_api_port, streamName) : "",
      ack: true
    });
    await this.setStateAsync(device.getStateID(import_types.DeviceStateID.LIVESTREAM_RTSP), {
      val: available ? (0, import_go2rtc.buildRtspUrl)(this.config.hostname, this.config.go2rtc_rtsp_port, streamName) : "",
      ack: true
    });
  }
  /**
   * Starts a livestream go2rtc asked for, with retries for starts that fail without any event.
   *
   * @param device_sn The serial number of the device
   */
  async startOnDemandLivestream(device_sn) {
    await (0, import_ondemand.startUntilDelivered)(device_sn, {
      isStreaming: async (serial) => {
        const device = await this.eufy.getDevice(serial);
        const station = await this.eufy.getStation(device.getStationSerial());
        return station.isLiveStreaming(device);
      },
      start: (serial) => this.startLivestream(serial),
      stop: (serial) => this.eufy.stopStationLivestream(serial),
      isWaiting: (serial) => {
        var _a;
        return ((_a = this.onDemand) == null ? void 0 : _a.isWaiting(serial)) ?? false;
      },
      markUnreachable: (serial) => {
        var _a;
        return (_a = this.onDemand) == null ? void 0 : _a.markUnreachable(serial);
      },
      cancelled: () => this.terminating,
      sleep: (ms) => new Promise((resolve) => this.setTimeout(resolve, ms, void 0)),
      log: {
        debug: (message) => this.logger.debug(message),
        info: (message) => this.logger.info(message),
        warn: (message) => this.logger.warn(message)
      }
    });
  }
  /**
   * Stops a livestream nobody watches anymore. A talkback needs the livestream, so the stop then
   * waits for the end of the talkback.
   *
   * @param device_sn The serial number of the device
   */
  async stopOnDemandLivestream(device_sn) {
    if (this.talkbacks.has(device_sn)) {
      this.logger.debug(`On-demand stream ${device_sn}: stopping the livestream after the talkback`);
      this.stopsAfterTalkback.add(device_sn);
      return;
    }
    await this.stopLivestream(device_sn);
  }
  async onStationLivestreamStart(station, device, metadata, videostream, audiostream) {
    try {
      this.startLivestreamTimeout(device.getSerial());
      await this.setLivestreamStates(device, true);
      if (this.onDemand) {
        videostream.on("error", (error) => {
          this.logger.error(`Device: ${device.getSerial()} - Videostream Error`, error);
        });
        audiostream.on("error", (error) => {
          this.logger.error(`Device: ${device.getSerial()} - Audiostream Error`, error);
        });
        this.onDemand.attach(
          device.getSerial(),
          videostream,
          audiostream,
          (0, import_video.createVideoFilter)(device.getSerial(), metadata, this.logger),
          metadata.videoCodec === import_eufy_security_client.VideoCodec.H265
        );
        return;
      }
      const results = await (0, import_video.streamToGo2rtc)(
        device.getSerial(),
        videostream,
        audiostream,
        this.logger,
        this.config,
        this.namespace,
        metadata
      );
      if ((0, import_go2rtc.streamToGo2rtcFailed)(results) && station.isLiveStreaming(device)) {
        this.logger.warn(
          `Station: ${station.getSerial()} Device: ${device.getSerial()} - Streaming to go2rtc failed - Stopping livestream...`
        );
        await this.eufy.stopStationLivestream(device.getSerial()).catch((error) => {
          this.logger.error(
            `Station: ${station.getSerial()} Device: ${device.getSerial()} - Error during stopping livestream...`,
            error
          );
        });
      }
    } catch (error) {
      this.logger.error(
        `Station: ${station.getSerial()} Device: ${device.getSerial()} - Error - Stopping livestream...`,
        error
      );
      this.eufy.stopStationLivestream(device.getSerial()).catch((error2) => {
        this.logger.error(
          `Station: ${station.getSerial()} Device: ${device.getSerial()} - Error during stopping livestream...`,
          error2
        );
      });
    }
  }
  async onStationLivestreamStop(_station, device) {
    var _a, _b;
    (_a = this.talkbacks.get(device.getSerial())) == null ? void 0 : _a.abort();
    this.clearLivestreamTimeout(device.getSerial());
    (_b = this.onDemand) == null ? void 0 : _b.detach(device.getSerial());
    try {
      await this.setLivestreamStates(device, this.onDemand !== void 0);
    } catch (error) {
      this.log.error(`Cannot clear the livestream states: ${error}`);
    }
  }
  async onStationRTSPUrl(station, device, value) {
    await (0, import_utils.setStateChangedAsync)(this, device.getStateID(import_types.DeviceStateID.RTSP_STREAM_URL), value);
  }
  async onStationConnect(station) {
    await this.setObjectNotExistsAsync(station.getStateID(import_types.StationStateID.CONNECTION), {
      type: "state",
      common: {
        name: "Connection",
        type: "boolean",
        role: "indicator.connection",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setStateAsync(station.getStateID(import_types.StationStateID.CONNECTION), { val: true, ack: true });
  }
  async onStationClose(station) {
    var _a;
    await this.setObjectNotExistsAsync(station.getStateID(import_types.StationStateID.CONNECTION), {
      type: "state",
      common: {
        name: "Connection",
        type: "boolean",
        role: "indicator.connection",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setStateAsync(station.getStateID(import_types.StationStateID.CONNECTION), { val: false, ack: true });
    try {
      for (const device of await this.eufy.getDevicesFromStation(station.getSerial())) {
        if (!device.hasCommand(import_eufy_security_client.CommandName.DeviceStartLivestream)) {
          continue;
        }
        this.clearLivestreamTimeout(device.getSerial());
        (_a = this.onDemand) == null ? void 0 : _a.detach(device.getSerial());
        await this.setLivestreamStates(device, this.onDemand !== void 0);
      }
    } catch (error) {
      this.logger.error(`Station: ${station.getSerial()} - Error while clearing livestream states`, error);
    }
  }
  onTFARequest() {
    this.logger.warn(
      `Two factor authentication request received, please enter valid verification code in state ${this.namespace}.verify_code`
    );
    this.verify_code = true;
  }
  async onCaptchaRequest(captchaId, captcha) {
    this.captchaId = captchaId;
    this.logger.warn(
      `Captcha authentication request received, please enter valid captcha in state ${this.namespace}.captcha`
    );
    this.logger.warn(`Captcha: <img src="${captcha}">`);
    await this.setStateAsync("received_captcha_html", { val: `<img src="${captcha}">`, ack: true });
  }
}
if (require.main !== module) {
  module.exports = (options) => new euSec(options);
} else {
  (() => new euSec())();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  euSec
});
//# sourceMappingURL=main.js.map
