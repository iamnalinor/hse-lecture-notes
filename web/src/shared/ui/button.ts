/*
The site's buttons: one primary (ink fill), one secondary (hairline), and the signal fill for a test
that is close (`isHighlighted`) — orange means «скоро КР» everywhere, never just «important».
Same height, radius and type for all three, so only the fill says which is which. The fill fades for
150ms on hover and focus, like the rest of the site. The trade-off: a fade also runs when the page
scrolls under a resting cursor, and then a button can briefly look like it leaves a darker copy of
itself behind. At 150ms that is barely visible, so the smoothness wins; if it ever gets annoying, drop `transition-colors` here.
*/
const BASE =
  "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-3.5 text-subhead sm:min-h-10 sm:px-4 font-semibold no-underline transition-colors duration-150 ease-out disabled:cursor-default disabled:opacity-50";

export const BUTTON_PRIMARY = `${BASE} bg-ink text-paper hover:bg-ink/85`;

export const BUTTON_SECONDARY = `${BASE} border border-rule bg-card text-ink hover:bg-wash`;

export const BUTTON_SIGNAL = `${BASE} bg-org-fill text-on-org-fill hover:bg-org-fill-hover`;
