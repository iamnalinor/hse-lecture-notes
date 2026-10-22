import { Navigate, useLocation, useParams } from "react-router";

import { paths } from "#web/domain/paths.ts";

/**
The theory page used to live at `/<course>/registry`. Saved links point there, often to a block
(`#reg-thm:…`), so the redirect keeps the hash and the query.
*/
export const LegacyTheoryRedirect = () => {
  const { course = "" } = useParams();
  const { hash, search } = useLocation();
  return <Navigate replace to={{ hash, pathname: paths.theory(course), search }} />;
};
