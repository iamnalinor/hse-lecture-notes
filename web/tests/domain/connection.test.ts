import { describe, expect, it } from "vitest";

import { canAutoDownload, type ConnectionInfo } from "#web/domain/connection.ts";

describe("canAutoDownload", () => {
  it.each<[string, ConnectionInfo]>([
    ["wifi", { saveData: false, type: "wifi" }],
    ["ethernet", { effectiveType: "4g", saveData: false, type: "ethernet" }],
    ["wifi without saveData", { type: "wifi" }],
    ["wifi, 3g-like speed", { effectiveType: "3g", type: "wifi" }],
  ])("allows %s", (_, connection) => {
    expect(canAutoDownload(connection)).toBe(true);
  });

  it.each<[string, ConnectionInfo | undefined]>([
    ["no API (Firefox, Safari)", undefined],
    ["desktop Chrome: no type", { effectiveType: "4g", saveData: false }],
    ["cellular", { effectiveType: "4g", saveData: false, type: "cellular" }],
    ["bluetooth tethering", { type: "bluetooth" }],
    ["wimax", { type: "wimax" }],
    ["mixed", { type: "mixed" }],
    ["other", { type: "other" }],
    ["unknown", { type: "unknown" }],
    ["offline", { type: "none" }],
    ["wifi with data saver", { saveData: true, type: "wifi" }],
    ["slow wifi", { effectiveType: "2g", type: "wifi" }],
    ["very slow ethernet", { effectiveType: "slow-2g", type: "ethernet" }],
  ])("refuses %s", (_, connection) => {
    expect(canAutoDownload(connection)).toBe(false);
  });

  it.each<[string, ConnectionInfo | undefined]>([
    ["no API (Firefox, Safari)", undefined],
    ["desktop Chrome: no type", { effectiveType: "4g", saveData: false }],
    ["wifi", { type: "wifi" }],
  ])("allows %s on a desktop", (_, connection) => {
    expect(canAutoDownload(connection, { isDesktop: true })).toBe(true);
  });

  it.each<[string, ConnectionInfo]>([
    ["data saver", { saveData: true }],
    ["slow link", { effectiveType: "2g" }],
    ["cellular, said so", { type: "cellular" }],
  ])("refuses %s on a desktop", (_, connection) => {
    expect(canAutoDownload(connection, { isDesktop: true })).toBe(false);
  });
});
