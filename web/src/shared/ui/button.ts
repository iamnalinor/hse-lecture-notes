/*
The site's buttons: one primary (ink fill), one secondary (hairline), and the signal fill for a test
that is close (`isHighlighted`) — orange means «скоро КР» everywhere, never just «important».
Same height, radius and type for all three, so only the fill says which is which.
*/
const BASE =
  "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-4 text-subhead font-semibold no-underline transition-colors disabled:cursor-default disabled:opacity-50";

export const BUTTON_PRIMARY = `${BASE} bg-ink text-paper hover:bg-ink/85`;

export const BUTTON_SECONDARY = `${BASE} border border-rule bg-card text-ink hover:bg-wash`;

export const BUTTON_SIGNAL = `${BASE} bg-org-fill text-on-org-fill hover:bg-org-fill-hover`;
