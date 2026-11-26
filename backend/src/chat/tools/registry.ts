import type { CodexFunctionTool } from "../../types";
import { READ_BLOCK_TOOL, runReadBlock } from "./read-block";
import { READ_DOCUMENT_TOOL, runReadDocument } from "./read-document";
import { runSampleProblems, SAMPLE_PROBLEMS_TOOL } from "./sample-problems";
import { runSearchMaterials, SEARCH_MATERIALS_TOOL } from "./search-materials";
import type { ToolArgs, ToolExecutionContext, ToolResult } from "./types";

type ToolHandler = (ctx: ToolExecutionContext, args: ToolArgs) => Promise<ToolResult>;

const TOOLS: ReadonlyArray<{ definition: CodexFunctionTool; run: ToolHandler }> = [
  { definition: SEARCH_MATERIALS_TOOL, run: runSearchMaterials },
  { definition: READ_BLOCK_TOOL, run: runReadBlock },
  { definition: READ_DOCUMENT_TOOL, run: runReadDocument },
  { definition: SAMPLE_PROBLEMS_TOOL, run: (_ctx, args) => runSampleProblems(args) },
];

/** The 4 agent tools offered to the model: search_materials, read_block, read_document, sample_problems. */
export const AGENT_TOOLS: CodexFunctionTool[] = TOOLS.map((tool) => tool.definition);

export function findToolHandler(name: string): ToolHandler | undefined {
  return TOOLS.find((tool) => tool.definition.name === name)?.run;
}
