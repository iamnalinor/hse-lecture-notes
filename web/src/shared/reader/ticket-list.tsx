import {
  type DOMNode,
  domToReact,
  Element,
  type HTMLReactParserOptions,
  Text,
} from "html-react-parser";
import { type ReactElement, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { z } from "zod";

import { ChevronIcon } from "#web/shared/ui/icons.tsx";

import { textOf } from "./dom-utils.ts";

type Replace = NonNullable<HTMLReactParserOptions["replace"]>;

type TicketEntry = {
  readonly body: ReactNode;
  readonly id: string | undefined;
  readonly number: string | undefined;
  readonly title: ReactNode;
};

type Props = {
  /** Content right under `# Билеты` before the first ticket, if any. */
  readonly before?: ReactNode;
  /** Content after the ticket list (or a mounted slot). */
  readonly after?: ReactNode;
  readonly heading: ReactNode;
  readonly id: string | undefined;
  readonly tickets: readonly TicketEntry[];
};

const BULK_BUTTON =
  "min-h-8 cursor-pointer px-3 py-1 text-footnote font-semibold text-ink hover:bg-wash disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent pointer-coarse:min-h-11";

const TICKET_NUMBER = /^(?<num>\d+)\.(?:\s+|$)/u;

const firstElement = (nodes: readonly DOMNode[]): Element | undefined =>
  nodes.find((child): child is Element => child instanceof Element);

/** Splits a leading `12. ` from a ticket's `<h2>` so the number sits in its own tabular column. */
const splitTicketHeading = (
  headingNode: Element,
  replace: Replace,
): { readonly number: string | undefined; readonly title: ReactNode } => {
  const [first, ...rest] = headingNode.children as DOMNode[];
  if (first instanceof Text) {
    const match = TICKET_NUMBER.exec(first.data);
    if (match?.groups?.["num"] !== undefined) {
      const tail = first.data.slice(match[0].length);
      const nodes: DOMNode[] = tail === "" ? rest : [new Text(tail), ...rest];
      return {
        number: match.groups["num"],
        title: domToReact(nodes, { replace }),
      };
    }
  }
  return { number: undefined, title: domToReact(headingNode.children as DOMNode[], { replace }) };
};

const toTicketEntry = (node: Element, replace: Replace): TicketEntry | undefined => {
  if (node.name !== "section") {
    return undefined;
  }
  const headingNode = firstElement(node.children as DOMNode[]);
  if (headingNode?.name !== "h2") {
    return undefined;
  }
  const { number, title } = splitTicketHeading(headingNode, replace);
  const bodyNodes = (node.children as DOMNode[]).filter((child) => child !== headingNode);
  return {
    body: domToReact(bodyNodes, { replace }),
    id: node.attribs["id"],
    number,
    title,
  };
};

type Partition = {
  readonly after: DOMNode[];
  readonly before: DOMNode[];
  readonly tickets: TicketEntry[];
};

const partitionTickets = (
  nodes: readonly DOMNode[],
  headingNode: Element,
  replace: Replace,
): Partition => {
  const result: Partition = { after: [], before: [], tickets: [] };
  for (const child of nodes) {
    if (child === headingNode) {
      continue;
    }
    const entry = child instanceof Element ? toTicketEntry(child, replace) : undefined;
    if (entry !== undefined) {
      result.tickets.push(entry);
    } else if (result.tickets.length === 0) {
      result.before.push(child);
    } else {
      result.after.push(child);
    }
  }
  return result;
};

const loadOpenTickets = (storageKey: string): ReadonlySet<string> => {
  try {
    const raw = sessionStorage.getItem(storageKey);
    return new Set(raw === null ? [] : z.array(z.string()).parse(JSON.parse(raw)));
  } catch {
    return new Set();
  }
};

const saveOpenTickets = (storageKey: string, keys: readonly string[]): void => {
  try {
    if (keys.length === 0) {
      sessionStorage.removeItem(storageKey);
    } else {
      sessionStorage.setItem(storageKey, JSON.stringify(keys));
    }
  } catch {
    // private mode or quota exceeded: open state stays in memory until navigation
  }
};

const ticketKeyOf = (ticket: TicketEntry, index: number): string =>
  ticket.id ?? `ticket-${String(index)}`;

type RowProps = {
  readonly onToggle: () => void;
  readonly ticket: TicketEntry;
  readonly ticketKey: string;
};

const TicketRow = ({ onToggle, ticket, ticketKey }: RowProps) => (
  <section className="scroll-mt-6" id={ticket.id}>
    <details className="group/ticket" data-ticket={ticketKey} onToggle={onToggle}>
      <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-baseline gap-x-2.5 rounded-md px-2 py-2.5 text-left hover:bg-wash/60 [&::-webkit-details-marker]:hidden">
        {ticket.number !== undefined && (
          <span className="w-7 shrink-0 text-subhead font-semibold text-muted tabular-nums">
            {ticket.number}.
          </span>
        )}
        <h3 className="m-0 min-w-0 flex-1 text-body/snug font-semibold text-ink">{ticket.title}</h3>
        <span className="ml-2 shrink-0 self-center text-muted transition-transform duration-200 ease-out group-open/ticket:rotate-90 group-hover/ticket:text-ink">
          <ChevronIcon size={16} />
        </span>
      </summary>
      <div className="pt-1 pb-5 [&>*:first-child]:mt-2 [&>*:last-child]:mb-0">{ticket.body}</div>
    </details>
  </section>
);

const restoreOpenTickets = (list: HTMLDivElement | null, storageKey: string): number => {
  const saved = loadOpenTickets(storageKey);
  if (list === null || saved.size === 0) {
    return 0;
  }
  let count = 0;
  for (const item of list.querySelectorAll<HTMLDetailsElement>(":scope > section > details")) {
    const ticketKey = item.dataset["ticket"];
    if (ticketKey === undefined || !saved.has(ticketKey)) {
      continue;
    }
    item.open = true;
    count += 1;
  }
  return count;
};

/**
Compact table of contents for `# Билеты` on a prep page: each ticket is one row showing its number
and question, and opens in place to reveal its definitions, statement and step-by-step proof.
`<details>` elements stay uncontrolled so hash navigation (`useScrollToHash`) and browser find-in-page
can open a ticket without fighting React state; open ticket keys are persisted per history entry so
navigating into a lecture and hitting Back restores them before scroll restoration.
*/
const TicketList = ({ after, before, heading, id, tickets }: Props) => {
  const { key: locationKey, pathname } = useLocation();
  const storageKey = `ticket-list:${pathname}:${locationKey}:${id ?? ""}`;
  const listRef = useRef<HTMLDivElement>(null);
  const [openCount, setOpenCount] = useState(0);

  const ticketElements = (): HTMLDetailsElement[] =>
    listRef.current === null
      ? []
      : [...listRef.current.querySelectorAll<HTMLDetailsElement>(":scope > section > details")];

  const syncOpen = (): void => {
    const openKeys = ticketElements()
      .filter((item) => item.open)
      .map((item) => item.dataset["ticket"])
      .filter((item): item is string => item !== undefined);
    setOpenCount(openKeys.length);
    saveOpenTickets(storageKey, openKeys);
  };

  useLayoutEffect(() => {
    const count = restoreOpenTickets(listRef.current, storageKey);
    if (count > 0) {
      setOpenCount(count);
    }
  }, [storageKey]);

  const setAll = (isOpen: boolean): void => {
    for (const item of ticketElements()) {
      item.open = isOpen;
    }
    syncOpen();
  };

  return (
    <section className="scroll-mt-6" id={id}>
      <div className="mt-12 mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="m-0 text-title2/tight font-bold">{heading}</h2>
        <span className="inline-flex divide-x divide-rule overflow-hidden rounded-full border border-rule bg-card">
          <button
            className={BULK_BUTTON}
            disabled={openCount === tickets.length}
            onClick={() => {
              setAll(true);
            }}
            type="button"
          >
            Раскрыть все
          </button>
          <button
            className={BULK_BUTTON}
            disabled={openCount === 0}
            onClick={() => {
              setAll(false);
            }}
            type="button"
          >
            Свернуть все
          </button>
        </span>
      </div>
      {before}
      <div className="divide-y divide-rule border-y border-rule" ref={listRef}>
        {tickets.map((ticket, index) => {
          const ticketKey = ticketKeyOf(ticket, index);
          return (
            <TicketRow key={ticketKey} onToggle={syncOpen} ticket={ticket} ticketKey={ticketKey} />
          );
        })}
      </div>
      {after}
    </section>
  );
};

/** Renders a `# Билеты` section on a prep page as a compact collapsible ticket list, or `undefined` otherwise. */
export const renderTicketSection = (
  node: Element,
  replace: Replace,
  slot: ReactNode,
): ReactElement | undefined => {
  const nodes = node.children as DOMNode[];
  const headingNode = firstElement(nodes);
  if (headingNode?.name !== "h1" || textOf(headingNode).trim() !== "Билеты") {
    return undefined;
  }
  const { after, before, tickets } = partitionTickets(nodes, headingNode, replace);
  if (tickets.length === 0) {
    return undefined;
  }
  return (
    <TicketList
      after={
        <>
          {domToReact(after, { replace })}
          {slot}
        </>
      }
      before={before.length > 0 ? domToReact(before, { replace }) : undefined}
      heading={domToReact(headingNode.children as DOMNode[], { replace })}
      id={node.attribs["id"]}
      tickets={tickets}
    />
  );
};
