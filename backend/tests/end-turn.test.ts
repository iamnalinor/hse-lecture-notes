import { expect, test } from "bun:test";
import { buildEndTurnTool, parseEndTurnArguments } from "../src/end-turn";
test("strict nullable schema stays identical for first and later turns", () => {
  const tool = buildEndTurnTool();
  expect(tool.strict).toBe(true);
  expect(tool.parameters.required).toEqual(["title", "suggestion"]);
  expect(parseEndTurnArguments('{"title":null,"suggestion":null}', false)).toEqual({
    title: null,
    suggestion: null,
  });
  expect(() => parseEndTurnArguments('{"title":null,"suggestion":null}', true)).toThrow(
    "first_title_required",
  );
});
for (const suggestion of [
  "**Почему?**",
  "_Почему?_",
  "`x`",
  "[конспект](/math)",
  "$x^2$",
  "\\(x\\)",
  "\\frac{x}{2}",
  "- вопрос",
  "Что\nдальше?",
  " ",
  "x".repeat(161),
]) {
  test(`rejects malformed suggestion ${JSON.stringify(suggestion)}`, () =>
    expect(() =>
      parseEndTurnArguments(JSON.stringify({ title: "Тема", suggestion }), true),
    ).toThrow());
}
test("accepts natural user text and plain math, rejects missing/extra/wrong fields", () => {
  expect(
    parseEndTurnArguments(
      JSON.stringify({ title: "Тема", suggestion: "Почему x * y равно нулю?" }),
      true,
    ).suggestion,
  ).toBe("Почему x * y равно нулю?");
  for (const value of [
    { title: 1, suggestion: null },
    { title: null },
    { title: null, suggestion: null, x: 1 },
    null,
    [],
  ])
    expect(() => parseEndTurnArguments(JSON.stringify(value), false)).toThrow();
});
