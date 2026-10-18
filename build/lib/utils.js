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
var utils_exports = {};
__export(utils_exports, {
  commonChanged: () => commonChanged,
  compareVersions: () => compareVersions,
  convertCamelCaseToSnakeCase: () => convertCamelCaseToSnakeCase,
  deleteEmptyUnknownChannels: () => deleteEmptyUnknownChannels,
  deleteStates: () => deleteStates,
  getImageAsHTML: () => getImageAsHTML,
  getShortUrl: () => getShortUrl,
  handleUpdate: () => handleUpdate,
  removeFiles: () => removeFiles,
  setPropertyState: () => setPropertyState,
  setStateChangedAsync: () => setStateChangedAsync,
  toStateValue: () => toStateValue
});
module.exports = __toCommonJS(utils_exports);
var import_node_path = __toESM(require("node:path"));
var import_node_util = __toESM(require("node:util"));
const setStateChangedAsync = async function(adapter, id, value) {
  await adapter.setStateChangedAsync(id, value === void 0 || value === null ? null : { val: value, ack: true }).catch(() => {
  });
};
const toStateValue = (type, value) => (type === "string" || type === "object") && typeof value === "object" ? JSON.stringify(value) : value;
const setPropertyState = async function(adapter, id, name, value) {
  var _a;
  const obj = await adapter.getObjectAsync(id);
  if (((_a = obj == null ? void 0 : obj.native) == null ? void 0 : _a.name) !== name) {
    return false;
  }
  await setStateChangedAsync(adapter, id, toStateValue(obj.common.type, value));
  return true;
};
const PRESERVED_COMMON = ["custom", "smartName", "material", "habpanel", "mobile"];
const commonChanged = (stored, wanted) => {
  const comparable = (common) => Object.fromEntries(
    Object.entries(JSON.parse(JSON.stringify(common))).filter(
      ([key]) => !PRESERVED_COMMON.includes(key)
    )
  );
  return !import_node_util.default.isDeepStrictEqual(comparable(stored), comparable(wanted));
};
const getImageAsHTML = function(data, mime = "image/jpg") {
  if (data && data.length > 0) {
    return `<img src="data:${mime};base64,${data.toString("base64")}" style="width: auto ;height: 100%;" />`;
  }
  return "";
};
const removeFiles = async function(adapter, stationSerial, folderName, device_sn) {
  try {
    const dir_path = import_node_path.default.join(stationSerial, folderName);
    if (await adapter.fileExistsAsync(adapter.namespace, dir_path)) {
      const files = (await adapter.readDirAsync(adapter.namespace, dir_path)).filter(
        (fn) => fn.file.startsWith(device_sn)
      );
      try {
        for (const filename of files) {
          await adapter.delFileAsync(adapter.namespace, import_node_path.default.join(dir_path, filename.file));
        }
      } catch {
      }
    }
  } catch (error) {
    throw new Error(`Failed to remove files: ${error}`);
  }
};
const compareVersions = (a, b) => {
  const parts = (version) => version.split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};
const deleteStates = async function(adapter, property) {
  const states = await adapter.getStatesAsync(`*.${property}`);
  if (states) {
    const ids = Object.keys(states);
    for (const id of ids) {
      await adapter.delObjectAsync(id).catch(() => {
      });
    }
  }
};
const handleUpdate = async function(adapter, log, oldVersion) {
  var _a;
  if (oldVersion === "") {
    return;
  }
  if (compareVersions(oldVersion, "0.6.1") <= 0) {
    try {
      const all = await adapter.getStatesAsync("T*");
      if (all) {
        const ids = Object.keys(all);
        for (const id of ids) {
          await adapter.delObjectAsync(id, { recursive: false }).catch(() => {
          });
        }
      }
      const channels = await adapter.getChannelsOfAsync();
      if (channels) {
        for (const channel of channels) {
          if (channel.common.name !== "info") {
            await adapter.delObjectAsync(channel._id, { recursive: false }).catch(() => {
            });
          }
        }
      }
      const devices = await adapter.getDevicesAsync();
      if (devices) {
        for (const device of devices) {
          await adapter.delObjectAsync(device._id, { recursive: false }).catch(() => {
          });
        }
      }
    } catch (error) {
      log.error("Version 0.6.1: Error:", error);
    }
  }
  if (compareVersions(oldVersion, "0.7.4") <= 0) {
    try {
      await adapter.setObjectAsync("verify_code", {
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
    } catch (error) {
      log.error("Version 0.7.4: Error:", error);
    }
  }
  if (compareVersions(oldVersion, "1.0.0") <= 0) {
    for (const state of ["last_event_pic_url", "last_event_pic_html", "last_event_video_url"]) {
      try {
        await deleteStates(adapter, state);
      } catch (error) {
        log.error(`Version 1.0.0 - ${state}: Error:`, error);
      }
    }
  }
  if (compareVersions(oldVersion, "3.2.1") <= 0) {
    try {
      const objects = await adapter.getAdapterObjectsAsync();
      for (const [id, obj] of Object.entries(objects)) {
        if (id.endsWith(".set_privacy_angle") && ((_a = obj.common) == null ? void 0 : _a.name) === "Set Default Angle") {
          await adapter.extendObjectAsync(id, { common: { name: "Set Privacy Angle" } });
        }
      }
    } catch (error) {
      log.error("Version 3.2.1 - set_privacy_angle: Error:", error);
    }
    try {
      const objects = await adapter.getAdapterObjectsAsync();
      for (const [id, obj] of Object.entries(objects)) {
        if (!id.endsWith(".titl_down")) {
          continue;
        }
        const newId = `${id.slice(0, -"titl_down".length)}tilt_down`;
        if (objects[newId] === void 0) {
          await adapter.setObjectAsync(newId, { ...obj, _id: newId });
        }
        await adapter.delObjectAsync(id);
      }
    } catch (error) {
      log.error("Version 3.2.1 - titl_down: Error:", error);
    }
  }
};
const deleteEmptyUnknownChannels = async function(adapter) {
  var _a;
  const objects = await adapter.getAdapterObjectsAsync();
  const ids = Object.keys(objects);
  for (const [id, obj] of Object.entries(objects)) {
    if (obj.type === "channel" && ((_a = obj.common) == null ? void 0 : _a.name) === "unknown" && !ids.some((other) => other.startsWith(`${id}.`))) {
      await adapter.delObjectAsync(id);
    }
  }
};
const convertCamelCaseToSnakeCase = function(value) {
  return value.replace(/[A-Z]/g, (letter, index) => {
    return index == 0 ? letter.toLowerCase() : `_${letter.toLowerCase()}`;
  });
};
function getShortUrl(url, prefixUrl) {
  if (url.password) {
    url = new URL(url.toString());
    url.password = "[redacted]";
  }
  let shortUrl = url.toString();
  if (prefixUrl && shortUrl.startsWith(prefixUrl)) {
    shortUrl = shortUrl.slice(prefixUrl.length);
  }
  return shortUrl;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  commonChanged,
  compareVersions,
  convertCamelCaseToSnakeCase,
  deleteEmptyUnknownChannels,
  deleteStates,
  getImageAsHTML,
  getShortUrl,
  handleUpdate,
  removeFiles,
  setPropertyState,
  setStateChangedAsync,
  toStateValue
});
//# sourceMappingURL=utils.js.map
