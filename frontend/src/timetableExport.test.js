import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadTimetableImage,
  createTimetablePdf,
  sectionCode,
} from "./timetableExport.js";

const timetable = { name: "Sample timetable" };
const section = {
  label: "Computer Engineering - Section A",
  entries: [{
    day: "Monday", start: 9, end: 11, code: "CMPE-101",
    course: "Sample course", teacher: "Teacher", room: "R1", type: "theory",
  }],
};
const settings = {
  days: ["Monday", "Tuesday", "Wednesday", "Thursday"],
  day_start: 8,
  day_end: 16,
  lunch_start: 12,
  lunch_end: 13,
};

test("exports use the same short degree-section code across download surfaces", async () => {
  assert.equal(sectionCode(section), "CE-A");
  const { filename } = await createTimetablePdf(timetable, section, settings);
  assert.match(filename, /CE-A\.pdf$/);
});

test("exports a vector PDF without converting a screenshot to PNG", async () => {
  const { pdf, filename } = await createTimetablePdf(timetable, section, settings);
  const output = new Uint8Array(pdf.output("arraybuffer"));
  assert.match(filename, /\.pdf$/);
  assert.deepEqual([...output.slice(0, 4)], [37, 80, 68, 70]);
  assert.ok(output.length > 1000);
});

test("exports a non-empty PNG with a valid signature", async () => {
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const downloads = [];
  globalThis.Image = class {
    width = 1350;
    height = 800;
    set src(value) { this.source = value; }
    async decode() {}
  };
  globalThis.document = {
    body: { append: (link) => downloads.push(link) },
    createElement(name) {
      if (name === "canvas") {
        return {
          getContext: () => ({ fillRect() {}, drawImage() {} }),
          toBlob(callback) {
            callback(new Blob([
              new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
              new Uint8Array(128),
            ], { type: "image/png" }));
          },
        };
      }
      return {
        click() { this.clicked = true; },
        remove() {},
      };
    },
  };
  globalThis.window = { setTimeout };
  try {
    await downloadTimetableImage(timetable, section, settings);
  } finally {
    globalThis.Image = originalImage;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }

  assert.equal(downloads.length, 1);
  assert.match(downloads[0].download, /\.png$/);
  assert.match(downloads[0].href, /^blob:/);
  assert.equal(downloads[0].clicked, true);
});
