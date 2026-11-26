/**
 * Pieces shared by the SQL of the admission transaction (usage_runs, budget_*, chat_threads,
 * chat_messages): every write after the run insert is conditional on that run row existing.
 */

/** True once the run with the bound id has been admitted in the same batch. */
export const RUN_ADMITTED = "EXISTS (SELECT 1 FROM usage_runs WHERE id = ?)";

/** A boolean SQL condition together with its bindings, composed into a larger statement. */
export interface SqlGuard {
  sql: string;
  bindings: (number | string | null)[];
}
