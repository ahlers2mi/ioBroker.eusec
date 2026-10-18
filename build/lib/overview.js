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
var overview_exports = {};
__export(overview_exports, {
  escapeHtml: () => escapeHtml,
  renderStreamOverview: () => renderStreamOverview
});
module.exports = __toCommonJS(overview_exports);
const TEXTS = {
  en: {
    empty: "No device with a livestream was found. The list fills once the adapter is connected to eufy.",
    noGo2rtc: "go2rtc is not available on this platform - livestreams cannot be played.",
    camera: "Device",
    station: "Station",
    player: "Player",
    rtsp: "RTSP",
    open: "open",
    original: "untouched stream",
    onDemand: "Opening a player URL or the RTSP URL starts the livestream. A station carries one livestream at a time.",
    pushOnly: 'The URLs only play while a livestream runs (start_stream). With the setting "Start livestreams on demand" opening them starts it.',
    hostname: (host) => `No host name is configured, so the URLs use "${host}" of the ioBroker host. If the devices that play the livestream reach the host at another address or name, enter it in the setting "Hostname".`
  },
  de: {
    empty: "Kein Ger\xE4t mit Livestream gefunden. Die Liste f\xFCllt sich, sobald der Adapter mit eufy verbunden ist.",
    noGo2rtc: "go2rtc ist auf dieser Plattform nicht verf\xFCgbar - Livestreams k\xF6nnen nicht abgespielt werden.",
    camera: "Ger\xE4t",
    station: "Station",
    player: "Player",
    rtsp: "RTSP",
    open: "\xF6ffnen",
    original: "unver\xE4nderter Stream",
    onDemand: "Das \xD6ffnen einer Player- oder RTSP-URL startet den Livestream. Eine Station \xFCbertr\xE4gt immer nur einen Livestream gleichzeitig.",
    pushOnly: 'Die URLs spielen nur, solange ein Livestream l\xE4uft (start_stream). Mit der Einstellung "Livestreams bei Bedarf starten" startet das \xD6ffnen ihn.',
    hostname: (host) => `Es ist kein Hostname eingetragen, deshalb verwenden die URLs "${host}" des ioBroker-Hosts. Erreichen die Ger\xE4te, die den Livestream abspielen, den Host unter einer anderen Adresse oder einem Namen, trage sie in der Einstellung "Hostname" ein.`
  }
};
const escapeHtml = (value) => value.replace(
  /[&<>"']/g,
  (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
);
const renderStreamOverview = (streams, context) => {
  const t = context.language === "de" ? TEXTS.de : TEXTS.en;
  if (context.noGo2rtc) {
    return `<p>${escapeHtml(t.noGo2rtc)}</p>`;
  }
  if (streams.length === 0) {
    return `<p>${escapeHtml(t.empty)}</p>`;
  }
  const cell = "padding:6px 10px;border-bottom:1px solid rgba(128,128,128,.3);vertical-align:top;text-align:left";
  const code = "font-family:monospace;font-size:90%;word-break:break-all";
  const link = (url, label) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  const rows = [...streams].sort((a, b) => a.station.localeCompare(b.station) || a.name.localeCompare(b.name)).map((stream) => {
    const player = [
      `${link(stream.playerUrl, t.open)}<br><span style="${code}">${escapeHtml(stream.playerUrl)}</span>`
    ];
    if (stream.originalPlayerUrl) {
      player.push(`${link(stream.originalPlayerUrl, t.original)}`);
    }
    return [
      "<tr>",
      `<td style="${cell}"><b>${escapeHtml(stream.name)}</b><br><small>${escapeHtml(stream.model)} \xB7 ${escapeHtml(stream.serial)}</small></td>`,
      `<td style="${cell}">${escapeHtml(stream.station)}</td>`,
      `<td style="${cell}">${player.join("<br>")}</td>`,
      `<td style="${cell}"><span style="${code}">${escapeHtml(stream.rtspUrl)}</span></td>`,
      "</tr>"
    ].join("");
  });
  const notes = [context.onDemand ? t.onDemand : t.pushOnly];
  if (context.hostnameAuto) {
    notes.push(t.hostname(context.hostnameAuto));
  }
  return [
    '<table style="border-collapse:collapse;width:100%">',
    `<thead><tr>${[t.camera, t.station, t.player, t.rtsp].map((title) => `<th style="${cell}">${escapeHtml(title)}</th>`).join("")}</tr></thead>`,
    `<tbody>${rows.join("")}</tbody>`,
    "</table>",
    ...notes.map((note) => `<p style="opacity:.8">${escapeHtml(note)}</p>`)
  ].join("");
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  escapeHtml,
  renderStreamOverview
});
//# sourceMappingURL=overview.js.map
