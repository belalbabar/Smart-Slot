import assert from "node:assert/strict";
import test from "node:test";
import { buildTimetableGrid } from "./timetableGrid.js";

test("places saved classes in their day and time columns around lunch", () => {
  const grid = buildTimetableGrid([
    { entry_id: 1, day: "Monday", start: 13, end: 14, code: "CMPE-331" },
    { entry_id: 2, day: "Tuesday", start: 9, end: 12, code: "CMPE-341L" },
    { entry_id: 3, day: "Wednesday", start: 12, end: 13, code: "INVALID-LUNCH" },
  ], {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday"],
    day_start: 8,
    day_end: 16,
    lunch_start: 12,
    lunch_end: 13,
  }, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

  assert.equal(grid.visibleEntryCount, 2);
  assert.deepEqual(grid.headers.find((header) => header.start === 12), {
    column: 6,
    span: 1,
    start: 12,
    end: 13,
  });
  assert.deepEqual(
    grid.rows[0].cells.find((cell) => cell.kind === "entry"),
    {
      kind: "entry",
      column: 7,
      span: 1,
      entry: { entry_id: 1, day: "Monday", start: 13, end: 14, code: "CMPE-331" },
      start: 13,
      end: 14,
    }
  );
  assert.equal(grid.rows[1].cells.find((cell) => cell.kind === "entry").span, 3);
  assert.equal(grid.rows[4].off, true);
});
