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
var messages_exports = {};
__export(messages_exports, {
  handleMessage: () => handleMessage
});
module.exports = __toCommonJS(messages_exports);
var import_eufy_security_client = require("eufy-security-client");
const response = (sent, result) => ({ sended: sent, sent, result });
const isSerial = (value) => typeof value === "string" && value !== "";
const isOptional = (value, type) => value === void 0 || typeof value === type;
const handleMessage = async (eufy, command, message, log) => {
  const payload = typeof message === "object" && message !== null ? message : {};
  const missingParameters = response(
    false,
    `${command} command not sent because some required parameters are missing`
  );
  try {
    switch (command) {
      case "quickResponse": {
        log.debug(`quickResponse command - message: ${JSON.stringify(message)}`);
        if (!isSerial(payload.station_sn) || !isSerial(payload.device_sn) || typeof payload.voice_id !== "number") {
          return missingParameters;
        }
        const station = await eufy.getStation(payload.station_sn);
        const device = await eufy.getDevice(payload.device_sn);
        if (!device.hasCommand(import_eufy_security_client.CommandName.DeviceQuickResponse)) {
          return response(false, "quickResponse command not supported by specified device");
        }
        station.quickResponse(device, payload.voice_id);
        return response(true, "quickResponse command sent");
      }
      case "getQuickResponseVoices": {
        log.debug(`getQuickResponseVoices command - message: ${JSON.stringify(message)}`);
        if (!isSerial(payload.device_sn)) {
          return missingParameters;
        }
        return response(true, await eufy.getApi().getVoices(payload.device_sn));
      }
      case "snooze": {
        log.debug(`snooze command - message: ${JSON.stringify(message)}`);
        if (!isSerial(payload.station_sn) || !isSerial(payload.device_sn) || typeof payload.snooze_time !== "number" || !isOptional(payload.snooze_chime, "boolean") || !isOptional(payload.snooze_homebase, "boolean") || !isOptional(payload.snooze_motion, "boolean")) {
          return missingParameters;
        }
        const station = await eufy.getStation(payload.station_sn);
        const device = await eufy.getDevice(payload.device_sn);
        if (!device.hasCommand(import_eufy_security_client.CommandName.DeviceSnooze)) {
          return response(false, "snooze command not supported by specified device");
        }
        station.snooze(device, {
          snooze_time: payload.snooze_time,
          snooze_chime: payload.snooze_chime,
          snooze_homebase: payload.snooze_homebase,
          snooze_motion: payload.snooze_motion
        });
        return response(true, "snooze command sent");
      }
      case "chime": {
        log.debug(`chime command - message: ${JSON.stringify(message)}`);
        if (!isSerial(payload.station_sn) || !isOptional(payload.ringtone, "number")) {
          return missingParameters;
        }
        const station = await eufy.getStation(payload.station_sn);
        if (!station.hasCommand(import_eufy_security_client.CommandName.StationChime)) {
          return response(false, "chime command not supported by specified station");
        }
        station.chimeHomebase(payload.ringtone ?? 0);
        return response(true, "chime command sent");
      }
      case "pollRefresh": {
        log.debug(`pollRefresh command`);
        await eufy.refreshCloudData();
        return response(true, "pollRefresh command sent");
      }
      default: {
        const errorMessage = `Received unknown message: ${JSON.stringify(message)}`;
        log.warn(errorMessage);
        return response(false, errorMessage);
      }
    }
  } catch (error) {
    if (error instanceof import_eufy_security_client.StationNotFoundError) {
      return response(false, `${command} command not sent because specified station doesn't exists`);
    }
    if (error instanceof import_eufy_security_client.DeviceNotFoundError) {
      return response(false, `${command} command not sent because specified device doesn't exists`);
    }
    const errorMessage = `Error during processing of received message: ${error instanceof Error ? `${error.name} - ${error.message}` : String(error)}`;
    log.error(errorMessage);
    return response(false, errorMessage);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleMessage
});
//# sourceMappingURL=messages.js.map
