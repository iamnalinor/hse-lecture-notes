import { type JSX, useEffect, useState } from "react";

import responseVerbs from "./chat-response-verbs.json";

const pickResponseVerb = (previous?: string): string => {
  const choices = responseVerbs.filter((verb) => verb !== previous);
  // eslint-disable-next-line sonarjs/pseudo-random -- Cosmetic word selection, never used for security.
  return choices[Math.floor(Math.random() * choices.length)] ?? previous ?? "";
};

export const ChatResponseStatus = (): JSX.Element => {
  const [verb, setVerb] = useState(() => pickResponseVerb());
  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setVerb(pickResponseVerb);
    }, 5000);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, []);
  return <>{verb}…</>;
};
