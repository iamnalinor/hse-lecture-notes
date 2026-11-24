import { expect, test } from "bun:test";
import {
  buildMetadataTools,
  parseTopicArguments,
  parseSuggestionArguments,
} from "../src/chat/metadata-tools";
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
