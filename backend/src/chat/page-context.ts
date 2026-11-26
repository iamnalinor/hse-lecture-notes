import { listCourseDocuments } from "../course-repo";
import type { TrackedD1 } from "../db";
import { SYSTEM_PROMPT } from "./system-prompt";

// =============================================================================
// System prompt builder (with course outline & "← МЫ ЗДЕСЬ" marker)
// =============================================================================

export async function buildSystemPrompt(
  db: TrackedD1,
  course: string,
  docId: string,
): Promise<{
  instructions: string;
  context: string;
  outline: string;
  currentDocOrder: number;
  currentDocTitle: string;
}> {
  const documents = course === "" ? [] : await listCourseDocuments(db, course);

  let currentDocOrder = 0;
  let currentDocTitle = docId;

  const outlineLines: string[] = [];
  for (const d of documents) {
    const isCurrent = d.doc_id === docId;
    if (isCurrent) {
      currentDocOrder = d.order_index;
      currentDocTitle = d.title;
    }
    const marker = isCurrent ? "  ← МЫ ЗДЕСЬ" : "";
    outlineLines.push(`- [${d.doc_kind}] ${d.doc_id}: ${d.title}${marker}`);
  }

  const outlineSection = outlineLines.length
    ? `\n\nПЛАН КУРСА (${course}):\n${outlineLines.join("\n")}`
    : "";
  let pageContext =
    "Студент на главной странице. Курс и документ не выбраны. По умолчанию поиск охватывает все курсы. Для read_document указывай курс из результатов поиска.";
  if (docId) {
    pageContext = `Студент открыл документ «${currentDocTitle}» (${course}/${docId}). Отдавай приоритет текущей и более ранним лекциям. Если блок помечен later_in_course, предупреди, что это будет позже в курсе.`;
  } else if (course) {
    pageContext = `Студент на странице курса ${course}. Конкретный документ не выбран. Не предполагай, какие темы уже пройдены.`;
  }

  return {
    instructions: SYSTEM_PROMPT,
    context: pageContext,
    outline: outlineSection,
    currentDocOrder,
    currentDocTitle,
  };
}
