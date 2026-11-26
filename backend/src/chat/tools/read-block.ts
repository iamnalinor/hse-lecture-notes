import { findBlockIdByAnchor, readBlockWithRefs } from "../../course-repo";
import type { CodexFunctionTool } from "../../types";
import { classifyChronology } from "./chronology";
import type { ToolArgs, ToolExecutionContext, ToolResult } from "./types";

export const READ_BLOCK_TOOL: CodexFunctionTool = {
  type: "function",
  name: "read_block",
  description:
    "Прочитать полный текст конкретного блока конспекта по его ID, включая доказательство (если include_proof=true) и исходящие/входящие ссылки на другие блоки.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "ID блока или ссылка из refs банка задач в формате /курс/документ#метка.",
      },
      include_proof: {
        type: "boolean",
        description: "Включить ли доказательство/решение блока (по умолчанию true).",
      },
    },
    required: ["id"],
    additionalProperties: false,
  },
};

/** An id that is not already `block:...` may be an anchor label or a `/course/doc#anchor` link. */
async function resolveBlockId(ctx: ToolExecutionContext, id: string): Promise<string> {
  if (id.startsWith("block:")) return id;
  const source = /^\/([^/#]+)(?:\/([^/#]+))?#(.+)$/u.exec(id);
  const course = source?.[1] ?? ctx.currentCourse;
  const doc = source?.[2] ?? null;
  const resolved = await findBlockIdByAnchor(
    ctx.db,
    course,
    source?.[3] ?? id,
    doc,
    ctx.currentDocId,
  );
  return resolved ?? id;
}

export async function runReadBlock(ctx: ToolExecutionContext, args: ToolArgs): Promise<ToolResult> {
  const requestedId = String(args.id ?? "").trim();
  const includeProof = args.include_proof !== false;
  if (!requestedId) {
    return {
      output: JSON.stringify({ error: "Missing block id" }),
      step: { kind: "read", target: "", state: "error" },
    };
  }

  const id = await resolveBlockId(ctx, requestedId);
  ctx.signal?.throwIfAborted();
  const { block, outgoing, incoming } = await readBlockWithRefs(ctx.db, id);

  if (!block) {
    return {
      output: JSON.stringify({ error: `Block not found: ${id}` }),
      step: { kind: "read", target: id, state: "error" },
    };
  }

  const payload = {
    id: block.id,
    anchor_id: block.anchor_id,
    course: block.course,
    doc_kind: block.doc_kind,
    doc_id: block.doc_id,
    block_kind: block.block_kind,
    section_id: block.section_id,
    title: block.title,
    chronology: classifyChronology(ctx, block.course, block.doc_id, block.doc_order),
    statement_tex: block.statement_tex,
    ...(includeProof && block.proof_tex ? { proof_tex: block.proof_tex } : {}),
    outgoing_refs: outgoing,
    incoming_refs: incoming,
  };

  return {
    output: JSON.stringify(payload),
    step: { kind: "read", target: block.title || block.id, state: "done" },
  };
}
