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
var picture_exports = {};
__export(picture_exports, {
  describePictureData: () => describePictureData,
  getPictureExtension: () => getPictureExtension,
  schedulePictureOverP2P: () => schedulePictureOverP2P
});
module.exports = __toCommonJS(picture_exports);
var import_eufy_security_client = require("eufy-security-client");
const getPictureExtension = function(picture) {
  var _a;
  const ext = (_a = picture == null ? void 0 : picture.type) == null ? void 0 : _a.ext;
  if (!ext || ext === "unknown" || !Buffer.isBuffer(picture.data) || picture.data.length === 0) {
    return void 0;
  }
  return ext;
};
const describePictureData = function(data) {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    return "no data";
  }
  const colon = data.subarray(0, 32).indexOf(58);
  const prefix = colon > 0 ? data.subarray(0, colon).toString("latin1") : "";
  return /^\w+$/.test(prefix) ? `${data.length} bytes, format "${prefix}"` : `${data.length} bytes, unrecognised format`;
};
const schedulePictureOverP2P = function(station, device, pending, setTimer) {
  if (!station.hasCommand(import_eufy_security_client.CommandName.StationDatabaseQueryLatestInfo)) {
    return false;
  }
  const serial = device.getSerial();
  if (pending.has(serial)) {
    return true;
  }
  const clipLength = device.getPropertyValue(import_eufy_security_client.PropertyName.DeviceRecordingClipLength);
  const seconds = device.getPropertyValue(import_eufy_security_client.PropertyName.DevicePowerWorkingMode) === 2 && typeof clipLength === "number" && Number.isFinite(clipLength) && clipLength > 0 ? Math.min(clipLength, 300) : 60;
  pending.add(serial);
  setTimer(() => {
    pending.delete(serial);
    station.databaseQueryLatestInfo();
  }, seconds * 1e3);
  return true;
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  describePictureData,
  getPictureExtension,
  schedulePictureOverP2P
});
//# sourceMappingURL=picture.js.map
