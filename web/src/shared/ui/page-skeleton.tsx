/** Placeholders shown while a page and its document load: the layout appears at once, no jump. */

const BAR = "rounded-md bg-wash motion-safe:animate-pulse";

const Lines = ({ widths }: { readonly widths: readonly string[] }) => (
  <div className="flex flex-col gap-3">
    {widths.map((width, index) => (
      // eslint-disable-next-line @eslint-react/no-array-index-key -- static placeholder rows, never reordered
      <div className={`h-4 ${BAR}`} key={index} style={{ width }} />
    ))}
  </div>
);

const PARAGRAPH = ["100%", "97%", "99%", "92%", "60%"];

const Header = () => (
  <div className="flex flex-col gap-4 border-b border-rule pt-8 pb-6.5 lg:pt-12">
    <div className={`h-3.5 w-40 ${BAR}`} />
    <div className={`h-3.5 w-56 ${BAR}`} />
    <div className={`h-10 w-4/5 ${BAR}`} />
    <div className={`h-8 w-24 self-end ${BAR}`} />
  </div>
);

/** Lecture and theory pages: table of contents on the left, title, a block, paragraphs. */
export const DocSkeleton = () => (
  <div
    aria-busy="true"
    aria-label="Загрузка"
    className="mx-auto grid max-w-[1240px] grid-cols-[minmax(0,800px)] justify-center gap-14 px-4 min-[1100px]:grid-cols-[230px_minmax(0,800px)] sm:px-8"
    role="status"
  >
    <div className="hidden pt-14 min-[1100px]:block">
      <Lines widths={["40%", "85%", "70%", "90%", "65%", "80%", "55%"]} />
    </div>
    <div className="min-w-0 pb-20">
      <Header />
      <div className="mt-10 flex flex-col gap-8">
        <Lines widths={PARAGRAPH} />
        <div className={`h-36 rounded-sm border border-rule ${BAR}`} />
        <Lines widths={PARAGRAPH} />
        <Lines widths={PARAGRAPH.slice(1)} />
      </div>
    </div>
  </div>
);

/** Home, course and glossary pages. */
export const PageSkeleton = () => (
  <div
    aria-busy="true"
    aria-label="Загрузка"
    className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-14 sm:px-8"
    role="status"
  >
    <div className={`h-3.5 w-48 ${BAR}`} />
    <div className={`h-12 w-3/5 ${BAR}`} />
    <Lines widths={["70%", "64%"]} />
    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <div className={`h-56 ${BAR}`} />
      <div className={`h-56 ${BAR}`} />
      <div className={`h-56 ${BAR}`} />
    </div>
  </div>
);
