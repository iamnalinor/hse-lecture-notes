import { splitTex } from "#web/domain/text.ts";

import { TexMath } from "./tex-math.tsx";

/** A label title from `index.json`: plain text where `$…$` is a formula. */
export const TexText = ({ text }: { readonly text: string }) =>
  splitTex(text).map((part, index) =>
    part.kind === "math" ? (
      // eslint-disable-next-line @eslint-react/no-array-index-key -- parts of a fixed string, never reordered
      <TexMath display={false} key={index} tex={part.value} />
    ) : (
      part.value
    ),
  );
