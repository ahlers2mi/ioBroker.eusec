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
var eufyApiCompat_exports = {};
__export(eufyApiCompat_exports, {
  applyEufyApiCompatibility: () => applyEufyApiCompatibility,
  describeSubstitutedDevice: () => describeSubstitutedDevice,
  eufyClientOptions: () => eufyClientOptions,
  isIdentityRejected: () => isIdentityRejected,
  keepStationsConnected: () => keepStationsConnected,
  normalizeSuccessCode: () => normalizeSuccessCode,
  parseSerialList: () => parseSerialList,
  substituteDeviceTypes: () => substituteDeviceTypes
});
module.exports = __toCommonJS(eufyApiCompat_exports);
var import_eufy_security_client = require("eufy-security-client");
const eufyClientOptions = {
  enableEmbeddedPKCS1Support: true
};
const DEVICE_TYPE_SUBSTITUTES = {
  10031: import_eufy_security_client.DeviceType.SOLO_CAMERA_SPOTLIGHT_1080
  // eufyCam C31 (T817L), see #156
};
const substituteDeviceTypes = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }
  const replaced = [];
  for (const entry of list) {
    const type = entry == null ? void 0 : entry.device_type;
    const substitute = typeof type === "number" ? DEVICE_TYPE_SUBSTITUTES[type] : void 0;
    if (substitute !== void 0) {
      replaced.push({ type, entry });
      entry.device_type = substitute;
    }
  }
  return replaced;
};
const describeSubstitutedDevice = (substituted) => {
  const { type, entry } = substituted;
  return `Parameters of ${String(entry.device_name)} (type ${type}, model ${String(entry.device_model)}, firmware ${String(entry.main_sw_version)}, hardware ${String(entry.main_hw_version)}) - please post them in #156 with serial numbers, IP addresses, WLAN names, keys and tokens replaced by xxx: ${JSON.stringify(
    entry.params
  )}`;
};
const LEGACY_SUCCESS_CODE = import_eufy_security_client.ResponseErrorCode.CODE_OK;
const HTTP_SUCCESS_CODE = 200;
const IDENTITY_REJECTED_CODES = [
  import_eufy_security_client.ResponseErrorCode.CODE_NEED_NEGOTIATE_KEY,
  import_eufy_security_client.ResponseErrorCode.CODE_SIGNATURE_ERROR
];
const isIdentityRejected = (result) => {
  if (result === null || typeof result !== "object") {
    return false;
  }
  const { code } = result;
  return typeof code === "number" && IDENTITY_REJECTED_CODES.includes(code);
};
const normalizeSuccessCode = (data) => {
  if (data === null || typeof data !== "object") {
    return false;
  }
  const result = data;
  if (result.code !== HTTP_SUCCESS_CODE) {
    return false;
  }
  result.code = LEGACY_SUCCESS_CODE;
  return true;
};
const keptStations = /* @__PURE__ */ new Set();
const parseSerialList = (value) => {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const serials = items.filter((item) => typeof item === "string").map((item) => item.trim().toUpperCase()).filter((item) => item !== "");
  return [...new Set(serials)];
};
const keepStationsConnected = (serials) => {
  keptStations.clear();
  for (const serial of serials) {
    keptStations.add(serial);
  }
};
let patched = false;
const applyEufyApiCompatibility = (log) => {
  if (patched) {
    return;
  }
  patched = true;
  const originalRequest = import_eufy_security_client.HTTPApi.prototype.request;
  let reportedSuccessCode = false;
  import_eufy_security_client.HTTPApi.prototype.request = async function(request, withoutUrlPrefix) {
    const response = await originalRequest.call(this, request, withoutUrlPrefix);
    if (normalizeSuccessCode(response == null ? void 0 : response.data) && !reportedSuccessCode) {
      reportedSuccessCode = true;
      log(
        "The Eufy API answers with the HTTP style code 200 where the legacy code 0 is expected. The adapter normalizes it - see bropat/eufy-security-client#975."
      );
    }
    return response;
  };
  const originalCheckPushToken = import_eufy_security_client.HTTPApi.prototype.checkPushToken;
  let legacyPushRejected = false;
  import_eufy_security_client.HTTPApi.prototype.checkPushToken = async function() {
    if (legacyPushRejected) {
      return false;
    }
    const accepted = await originalCheckPushToken.call(this);
    if (!accepted) {
      legacyPushRejected = true;
      log(
        "The legacy push endpoint rejected this account, which is expected once it has been migrated to the v6 backend. The adapter stops asking it - push is delivered over v6."
      );
    }
    return accepted;
  };
  const originalCall = import_eufy_security_client.MegaHTTPApi.prototype.call;
  let reportedIdentityRetry = false;
  import_eufy_security_client.MegaHTTPApi.prototype.call = async function(host, path, payload) {
    const result = await originalCall.call(this, host, path, payload);
    if (!isIdentityRejected(result)) {
      return result;
    }
    if (!reportedIdentityRetry) {
      reportedIdentityRetry = true;
      log(
        "The v6 backend rejected a stored identity. The adapter repeats the call with a renegotiated one instead of reporting push as closed."
      );
    }
    return originalCall.call(this, host, path, payload);
  };
  const originalGetDeviceList = import_eufy_security_client.HTTPApi.prototype.getDeviceList;
  const originalGetStationList = import_eufy_security_client.HTTPApi.prototype.getStationList;
  const reportedDeviceTypes = /* @__PURE__ */ new Set();
  const reportedDevices = /* @__PURE__ */ new Set();
  const reportSubstitutes = (substituted) => {
    for (const { type } of substituted) {
      if (!reportedDeviceTypes.has(type)) {
        reportedDeviceTypes.add(type);
        log(
          `Device type ${type} is not known to eufy-security-client. The adapter treats it as type ${DEVICE_TYPE_SUBSTITUTES[type]} - see #156.`
        );
      }
    }
  };
  import_eufy_security_client.HTTPApi.prototype.getDeviceList = async function() {
    const devices = await originalGetDeviceList.call(this);
    const substituted = substituteDeviceTypes(devices);
    reportSubstitutes(substituted);
    for (const device of substituted) {
      if (!reportedDevices.has(device.entry.device_sn)) {
        reportedDevices.add(device.entry.device_sn);
        log(describeSubstitutedDevice(device));
      }
    }
    return devices;
  };
  import_eufy_security_client.HTTPApi.prototype.getStationList = async function() {
    const stations = await originalGetStationList.call(this);
    reportSubstitutes(substituteDeviceTypes(stations));
    return stations;
  };
  const originalUpdateRawStation = import_eufy_security_client.P2PClientProtocol.prototype.updateRawStation;
  const reportedKeptStations = /* @__PURE__ */ new Set();
  import_eufy_security_client.P2PClientProtocol.prototype.updateRawStation = function(value) {
    originalUpdateRawStation.call(this, value);
    const session = this;
    const serial = value == null ? void 0 : value.station_sn;
    if (!session.energySavingDevice || !keptStations.has(serial)) {
      return;
    }
    session.energySavingDevice = false;
    if (!reportedKeptStations.has(serial)) {
      reportedKeptStations.add(serial);
      log(
        `Station ${serial} is a battery device, but it is configured to stay connected: its P2P connection is kept open and reopened when it drops, which drains the battery if the device is not on permanent power.`
      );
    }
  };
  const originalIsFloodLightT8425 = import_eufy_security_client.Device.isFloodLightT8425;
  let reportedFloodlightE30 = false;
  import_eufy_security_client.Device.isFloodLightT8425 = function(type) {
    if (originalIsFloodLightT8425.call(this, type)) {
      return true;
    }
    if (!import_eufy_security_client.Device.isFloodLightT8426(type)) {
      return false;
    }
    if (!reportedFloodlightE30) {
      reportedFloodlightE30 = true;
      log(
        "The library defines the Floodlight Cam E30 (T8426) like the Floodlight Cam E340 (T8425), but sends it the commands of older floodlights. The adapter makes it send the E340 commands."
      );
    }
    return true;
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  applyEufyApiCompatibility,
  describeSubstitutedDevice,
  eufyClientOptions,
  isIdentityRejected,
  keepStationsConnected,
  normalizeSuccessCode,
  parseSerialList,
  substituteDeviceTypes
});
//# sourceMappingURL=eufyApiCompat.js.map
