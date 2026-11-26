import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyLoadFailure, fetchDeployedBuildId } from "#web/shared/chat/shell/build-version.ts";

const BUILD = import.meta.env.BUILD_TIME;

const deployed = (response: Error | Response) => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
};

const setOnline = (isOnline: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(isOnline);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchDeployedBuildId", () => {
  it("reads the id around every cache", async () => {
    deployed(Response.json({ id: "2027-01-01T00:00:00.000Z" }));
    expect(await fetchDeployedBuildId()).toBe("2027-01-01T00:00:00.000Z");
    expect(fetch).toHaveBeenCalledWith(
      "/version.json",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it.each([
    ["a failed request", new Error("offline")],
    ["no such file", new Response("", { status: 404 })],
    ["the page itself in place of the file (dev server)", new Response("<!doctype html>")],
    ["a file of another shape", Response.json({ version: 1 })],
  ])("is null for %s", async (_name, response) => {
    deployed(response);
    expect(await fetchDeployedBuildId()).toBeNull();
  });
});

describe("classifyLoadFailure", () => {
  it("knows this build's id", () => {
    expect(BUILD).not.toBe("");
  });

  it("is `offline` without a network and does not ask the server", async () => {
    setOnline(false);
    deployed(Response.json({ id: "other" }));
    expect(await classifyLoadFailure()).toBe("offline");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is `stale` when another build is deployed", async () => {
    setOnline(true);
    deployed(Response.json({ id: `${BUILD}-next` }));
    expect(await classifyLoadFailure()).toBe("stale");
  });

  it("is a network failure when the deployed build is this one, however often it is retried", async () => {
    setOnline(true);
    deployed(Response.json({ id: BUILD }));
    expect(await classifyLoadFailure()).toBe("network");
    expect(await classifyLoadFailure()).toBe("network");
  });

  it.each([
    ["the check itself fails", new Error("reset")],
    ["there is no version file (dev)", new Response("", { status: 404 })],
  ])("is a network failure when %s", async (_name, response) => {
    setOnline(true);
    deployed(response);
    expect(await classifyLoadFailure()).toBe("network");
  });
});
