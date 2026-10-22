import assert from "node:assert/strict";
import test from "node:test";
import { parseCourseRows } from "./courseImport.js";

test("parses course fields, optional teacher, and a lab row", () => {
  const result = parseCourseRows([
    ["Course Code", "Course Name", "Credit Hours", "Weekly Pattern", "Teacher", "Type", "Lab Kind"],
    ["CE-101", "Programming", 3, "2 + 1", "Sir Ali", "theory", ""],
    ["CE-102L", "Hardware Lab", 1, "lab3", "", "lab", "hardware"],
  ]);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.courses, [
    {
      code: "CE-101", name: "Programming", type: "theory",
      credit_hours: 3, weekly_pattern: "2+1", lab_kind: "", teacher: "Sir Ali",
    },
    {
      code: "CE-102L", name: "Hardware Lab", type: "lab",
      credit_hours: 1, weekly_pattern: "3", lab_kind: "hardware", teacher: "",
    },
  ]);
});

test("reports invalid rows and repeated course codes before import", () => {
  const result = parseCourseRows([
    ["Code", "Name", "Credits", "Pattern"],
    ["CE-101", "Programming", 3, "2+1"],
    ["CE-101", "Duplicate", 3, "2+1"],
    ["CE-102", "Missing pattern", 2, ""],
  ]);

  assert.equal(result.courses.length, 1);
  assert.match(result.errors[0], /Row 3: duplicate course code/);
  assert.match(result.errors[1], /Row 4: weekly pattern/);
});

test("requires the identifying course columns", () => {
  const result = parseCourseRows([["Code", "Name"], ["CE-101", "Programming"]]);
  assert.match(result.errors[0], /credit_hours, weekly_pattern/);
});

test("treats unavailable-teacher placeholders as an unassigned teacher", () => {
  const result = parseCourseRows([
    ["Code", "Name", "Credits", "Pattern", "Teacher"],
    ["CE-101", "Programming", 3, "2+1", "Not available yet"],
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.courses[0].teacher, "");
});
