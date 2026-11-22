import { syncedHint, type SyncedPart } from "#web/domain/synced.ts";
import { CheckIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  readonly synced: readonly SyncedPart[];
  readonly title: string;
};

/**
A lecture title; when the note was checked against the real lecture or seminars, a small green tick follows it.
The tick sits in one `nowrap` span with the last word, so a wrapped title never leaves it alone on a line.
*/
export const SyncedTitle = ({ synced, title }: Props) => {
  const hint = syncedHint(synced);
  if (hint === null) {
    return <>{title}</>;
  }
  const cut = title.trimEnd().lastIndexOf(" ");
  const head = cut === -1 ? "" : title.slice(0, cut + 1);
  const last = cut === -1 ? title : title.slice(cut + 1);
  return (
    <>
      {head}
      <span className="whitespace-nowrap" data-testid="title-tail">
        {last}
        <span className="ml-1.5 inline-block align-middle text-ex" title={hint}>
          <CheckIcon size={14} />
          <span className="sr-only">{hint}</span>
        </span>
      </span>
    </>
  );
};
