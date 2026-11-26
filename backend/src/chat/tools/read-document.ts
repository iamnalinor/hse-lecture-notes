import {
  listCourseDocumentsCompact,
  listDocumentBlocks,
  readDocumentWithIntro,
} from "../../course-repo";
import type { CodexFunctionTool } from "../../types";
import { courseArg, optionalStringArg } from "./args";
import { classifyChronology } from "./chronology";
import type { ToolArgs, ToolExecutionContext, ToolResult } from "./types";

export const READ_DOCUMENT_TOOL: CodexFunctionTool = {
  type: "function",
  name: "read_document",
  description:
    "Прочитать структуру или блоки конкретного документа (лекции/теории/подготовки). Если doc_id не передан — возвращает оглавление курса.",
  parameters: {
    type: "object",
    properties: {
      course: {
        type: "string",
        enum: ["algebra", "calculus", "discrete", "aiya"],
        description:
          "Код курса: calculus — математический анализ (матан), algebra — алгебра, discrete — дискретная математика, aiya — алгоритмы.",
      },
      doc_id: { type: "string", description: "ID документа (например, 07_oct16_primes_fta)." },
      section_id: { type: "string", description: "Опциональный ID раздела внутри документа." },
    },
    required: ["course"],
    additionalProperties: false,
  },
};

/** The section and all its nested sections, in outline order. */
function sectionWithDescendants(
  outline: Array<{ id: string; level: number }>,
  sectionId: string,
): string[] {
  const sectionIds = [sectionId];
  const index = outline.findIndex((heading) => heading.id === sectionId);
  if (index >= 0) {
    const level = outline[index]!.level;
    for (const heading of outline.slice(index + 1)) {
      if (heading.level <= level) break;
      sectionIds.push(heading.id);
    }
  }
  return sectionIds;
}

export async function runReadDocument(
  ctx: ToolExecutionContext,
  args: ToolArgs,
): Promise<ToolResult> {
  const course = courseArg(args, ctx);
  const docId = optionalStringArg(args, "doc_id");
  const sectionId = optionalStringArg(args, "section_id");

  // Without doc_id: return compact course outline, never the whole course body
  if (!docId) {
    const documents = await listCourseDocumentsCompact(ctx.db, course);
    return {
      output: JSON.stringify({ course, documents }),
      step: { kind: "read", target: `Оглавление ${course}`, state: "done" },
    };
  }

  const doc = await readDocumentWithIntro(ctx.db, course, docId);
  ctx.signal?.throwIfAborted();
  if (!doc) {
    return {
      output: JSON.stringify({ error: `Document not found: ${course}/${docId}` }),
      step: { kind: "read", target: docId, state: "error" },
    };
  }

  const outline = JSON.parse(doc.outline_json) as Array<{ id: string; level: number }>;
  const blocks = await listDocumentBlocks(
    ctx.db,
    course,
    docId,
    sectionId ? { id: sectionId, sectionIds: sectionWithDescendants(outline, sectionId) } : null,
  );

  const compactBlocks = blocks.map((b) => ({
    id: b.id,
    anchor_id: b.anchor_id,
    block_kind: b.block_kind,
    title: b.title,
    statement_tex:
      b.statement_tex.length > 600
        ? `${b.statement_tex.slice(0, 599).trimEnd()}…`
        : b.statement_tex,
  }));

  return {
    output: JSON.stringify({
      course,
      doc_kind: doc.doc_kind,
      doc_id: doc.doc_id,
      title: doc.title,
      date: doc.date,
      introduction: doc.introduction,
      chronology: classifyChronology(ctx, course, doc.doc_id, doc.order_index),
      outline,
      blocks: compactBlocks,
    }),
    step: {
      kind: "read",
      target: sectionId ? `${doc.title} (${sectionId})` : doc.title,
      state: "done",
    },
  };
}
