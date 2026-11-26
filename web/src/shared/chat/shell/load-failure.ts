/**
`network`: the chunk did not arrive and the network may come back; `offline`: the browser says there
is none; `stale`: the network works but the chunk still does not arrive, which is what a deploy
that deleted the old hashed files looks like.
*/
export type ChatLoadFailure = "network" | "offline" | "stale";
