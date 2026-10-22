import { isRouteErrorResponse } from "react-router";

/**
Pages signal a missing course or lecture by throwing `Response(…, 404)` while rendering. React
Router only wraps such a throw into a route error response for loaders; a render-time throw reaches
the error boundary as the raw `Response`, so both shapes count as «not found».
*/
export const isNotFound = (error: unknown): boolean =>
  (isRouteErrorResponse(error) || error instanceof Response) && error.status === 404;
