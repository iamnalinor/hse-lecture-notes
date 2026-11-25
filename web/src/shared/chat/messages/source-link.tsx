import type { ReactNode } from "react";

import { Link, useLocation, useResolvedPath } from "react-router";

import { isOtherPage } from "#web/domain/paths.ts";
import { hashTarget } from "#web/shared/ui/dom.ts";

/** Keep a native, base-aware href for copying or opening another tab. The panel handles a plain
click so that an on-page reference can highlight its block and return focus on mobile. */
export const SourceLink = ({
  children,
  className,
  onFollow,
  to,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly onFollow?: (() => void) | undefined;
  readonly to: string;
}) => {
  const current = useLocation();
  const source = useResolvedPath(to);
  const isLocalBlock = source.hash !== "" && !isOtherPage(current.pathname, source.pathname);
  return (
    <Link
      className={className}
      data-ref={isLocalBlock ? hashTarget(source.hash) : undefined}
      onClick={(event) => {
        if (
          onFollow === undefined ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        onFollow();
      }}
      to={to}
    >
      {children}
    </Link>
  );
};
