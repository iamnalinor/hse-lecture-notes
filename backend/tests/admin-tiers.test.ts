import { expect, test } from "bun:test";
import { assignmentSql, parseTelegramIds, rosterSql } from "../scripts/admin-tiers";
import { SqliteD1Shim } from "./d1-shim";

test("roster sync preserves manual assignments and removes only old roster entries", () => {
  const { sqlite } = new SqliteD1Shim();
  sqlite.exec(assignmentSql("11", "extended", 1, "manual"));
  sqlite.exec(assignmentSql("22", "student", 1, "manual"));
  sqlite.exec(rosterSql([11, 33], 2));
  sqlite.exec(rosterSql([11, 44], 3));
  expect(
    sqlite.query("SELECT telegram_id,tier FROM telegram_account_tiers ORDER BY telegram_id").all(),
  ).toEqual([
    { telegram_id: 11, tier: "extended" },
    { telegram_id: 22, tier: "student" },
    { telegram_id: 44, tier: "student" },
  ]);
});

test("default removes an assignment and notes are SQL escaped", () => {
  const { sqlite } = new SqliteD1Shim();
  sqlite.exec(assignmentSql("42", "extended", 1, "reader's tier"));
  expect(sqlite.query("SELECT note FROM telegram_account_tiers").get()).toEqual({
    note: "reader's tier",
  });
  sqlite.exec(assignmentSql("42", "default", 2));
  expect(sqlite.query("SELECT COUNT(*) AS count FROM telegram_account_tiers").get()).toEqual({
    count: 0,
  });
});

test("invalid IDs and tier names are rejected before executing SQL", () => {
  for (const id of ["0", "-2", "1.5", "9007199254740992", "1); DELETE FROM telegram_account_tiers;"])
    expect(() => assignmentSql(id, "student", 1)).toThrow();
  expect(() => assignmentSql("42", "admin", 1)).toThrow();
  expect(() => parseTelegramIds("42,invalid")).toThrow();
  expect(parseTelegramIds("42, 43;42\n44")).toEqual([42, 43, 44]);
});
