import type { ReactElement } from "react";
import type { z } from "zod";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import type { CatalogSchema, LabelIndex } from "#web/domain/schemas.ts";

import { catalogQuery, labelIndexQuery, macrosQuery } from "#web/api/queries.ts";

const LABELS: LabelIndex = {
  algebra: {
    "def:lec02:transpose": {
      id: "def:lec02:transpose",
      lecture: 2,
      name: "Определение",
      number: "2.9",
      title: "транспонирование",
      type: "definition",
      weekId: "02_sep09_gauss_method",
    },
    "thm:lec04:laplace": {
      id: "thm:lec04:laplace",
      lecture: 4,
      name: "Теорема",
      number: "4.3",
      title: "разложение Лапласа",
      type: "theorem",
      weekId: "04_sep23_determinant_properties",
    },
  },
};

/** App providers with the shared data already in the cache: no network in unit tests. */
export const renderWithApp = (
  ui: ReactElement,
  route = "/algebra/04_sep23_determinant_properties",
  catalog?: z.infer<typeof CatalogSchema>,
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(macrosQuery.queryKey, {
    "\\R": String.raw`\mathbb{R}`,
    "\\rw": String.raw`\overline{\underline{\raisebox{0.12em}{$\smash[t]{\kern0.07em\mathsf{#1}\kern0.07em}$}}\rule{0pt}{0.7em}}`,
  });
  client.setQueryData(labelIndexQuery.queryKey, LABELS);
  if (catalog !== undefined) {
    client.setQueryData(catalogQuery.queryKey, catalog);
  }
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};
