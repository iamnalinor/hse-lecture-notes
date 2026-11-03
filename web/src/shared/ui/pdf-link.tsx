import { BUTTON_SECONDARY } from "./button.ts";
import { DownloadIcon } from "./icons.tsx";

/** A document's PDF as the site serves it (`/pdf/<course>-<doc>.pdf`), with the base path. */
export const pdfUrl = (course: string, docId: string): string =>
  `${import.meta.env.BASE_URL}pdf/${course}-${docId}.pdf`;

type Props = {
  readonly course: string;
  readonly docId: string;
  /** Text of the link: «PDF» unless the page offers several files. */
  readonly label?: string;
  readonly variant: "button" | "chip";
};

export const PdfLink = ({ course, docId, label = "PDF", variant }: Props) => (
  <a
    className={
      variant === "button"
        ? BUTTON_SECONDARY
        : "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-footnote text-muted no-underline hover:bg-wash hover:text-ink"
    }
    download
    href={pdfUrl(course, docId)}
  >
    <DownloadIcon size={variant === "button" ? 16 : 14} />
    {label}
  </a>
);
