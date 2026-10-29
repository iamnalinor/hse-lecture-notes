import { DownloadIcon } from "./icons.tsx";

const pdfUrl = (course: string, docId: string): string =>
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
        ? "inline-flex min-h-6 items-center gap-2 rounded-md border border-ink px-4 py-2 text-sm font-semibold text-ink no-underline"
        : "inline-flex items-center gap-1.5 rounded-md border border-rule px-2 py-1 text-[13px] text-muted no-underline"
    }
    download
    href={pdfUrl(course, docId)}
  >
    {variant === "button" && <DownloadIcon size={16} />}
    {label}
  </a>
);
