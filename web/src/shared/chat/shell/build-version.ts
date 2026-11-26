import { z } from "zod";

import type { ChatLoadFailure } from "./load-failure.ts";

/** `version.json` next to `index.html`: the build id of the copy of the site that is deployed now. */
const VersionSchema = z.object({ id: z.string().min(1) });

/**
The id of the deployed build, or `null` when it cannot be known: the request failed, or there is no
such file (`bun dev` answers with the page itself). Read around every cache: an old copy of the file
would hide the new version.
*/
export const fetchDeployedBuildId = async (): Promise<null | string> => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      return null;
    }
    const parsed = VersionSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.id : null;
  } catch {
    return null;
  }
};

/**
Why the chat code did not arrive. No network is `offline`. Otherwise the deployed build id decides:
another one than this page was built from means the old hashed files are gone (`stale`: only a
reload helps); the same one, or an answer that cannot be read, is a network trouble that a retry may
clear.
*/
export const classifyLoadFailure = async (): Promise<ChatLoadFailure> => {
  if (!navigator.onLine) {
    return "offline";
  }
  const deployed = await fetchDeployedBuildId();
  return deployed === null || deployed === import.meta.env.BUILD_TIME ? "network" : "stale";
};
