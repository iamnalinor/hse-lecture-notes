import { expect, test } from "bun:test";
import {
  buildMetadataTools,
  parseTopicArguments,
  parseSuggestionArguments,
} from "../src/chat/metadata-tools";
import { METADATA_PROMPT } from "../src/chat/system-prompt";
test("separate strict metadata tools each have one required string", () => {
  const tools = buildMetadataTools();
  expect(tools.map((t) => t.name)).toEqual(["set_topic", "suggest_reply"]);
  for (const t of tools) {
    expect(t.strict).toBe(true);
    expect(t.parameters.additionalProperties).toBe(false);
    expect(t.parameters.required).toHaveLength(1);
  }
  expect(parseTopicArguments('{"title":"Производные"}')).toBe("Производные");
  expect(() => parseTopicArguments('{"title":null}')).toThrow();
  expect(() => parseTopicArguments('{"title":""}')).toThrow();
  expect(parseSuggestionArguments('{"suggestion":"А как по алгебре?"}')).toBe("А как по алгебре?");
  for (const suggestion of ["x".repeat(81), "**Дальше**", "$x$", "два\nтри"])
    expect(() => parseSuggestionArguments(JSON.stringify({ suggestion }))).toThrow();
});

test("suggest_reply is required with every answer, not left to the model (owner's decision, 26.11.2026)", () => {
  const tool = buildMetadataTools().find((t) => t.name === "suggest_reply")!;
  for (const text of [tool.description, METADATA_PROMPT]) {
    expect(text).toContain("обязател");
    expect(text).not.toMatch(/не придумалось|Нет полезного продолжения/u);
  }
});
