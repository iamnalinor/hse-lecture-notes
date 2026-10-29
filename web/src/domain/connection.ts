/**
Whether the site may save every document for offline use on its own, without the reader asking.

Browsers do not say «metered» any more: the `metered` attribute was dropped from the Network
Information spec in 2014 and nobody ships it. What Chromium exposes (`navigator.connection`):

- `saveData` — the reader turned on data saving (Lite mode, «Экономия трафика», OS data saver).
  Desktop and Android.
- `type` — the link: `wifi`, `ethernet`, `cellular`, `bluetooth`, `wimax`, `mixed`, `other`,
  `unknown`, `none`. Only on Android and ChromeOS; desktop Chrome leaves it `undefined`.
- `effectiveType` — `slow-2g` … `4g`, an estimate of speed, not of cost. Desktop and Android.

Firefox and Safari have no `navigator.connection`.

The rule is conservative: download in the background only when the browser positively says the
link is Wi-Fi or Ethernet (unmetered in practice), the reader did not ask to save data and the
link is not crawling. Anything unknown — no API, no `type` (desktop Chrome: a laptop on a phone
hotspot looks the same as one at home), `cellular`, `bluetooth` (tethering), `wimax`, `mixed`,
`other` — means «do not», and the «Скачать все» button stays the way to save everything.
*/

/** The part of `NetworkInformation` the rule reads; every field may be absent. */
export type ConnectionInfo = {
  readonly effectiveType?: string | undefined;
  readonly saveData?: boolean | undefined;
  readonly type?: string | undefined;
};

const UNMETERED_TYPES: ReadonlySet<string> = new Set(["ethernet", "wifi"]);
/** Wi-Fi this slow would make the page itself wait: leave the bandwidth to the reader. */
const SLOW_EFFECTIVE_TYPES: ReadonlySet<string> = new Set(["2g", "slow-2g"]);

const isUnmetered = (connection: ConnectionInfo): boolean =>
  connection.type !== undefined && UNMETERED_TYPES.has(connection.type);

const isSlow = (connection: ConnectionInfo): boolean =>
  connection.effectiveType !== undefined && SLOW_EFFECTIVE_TYPES.has(connection.effectiveType);

export const canAutoDownload = (connection: ConnectionInfo | undefined): boolean =>
  connection !== undefined &&
  connection.saveData !== true &&
  isUnmetered(connection) &&
  !isSlow(connection);
