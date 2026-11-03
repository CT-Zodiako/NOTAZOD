import { test } from "node:test";
import assert from "node:assert/strict";
import { planCourseSync } from "../src/lib/campusSync.ts";

const student = (code) => ({ id: code, courseId: "c", fullName: code, code, documentId: code, institutionalEmail: `${code}@unimayor.edu.co`, personalEmail: `${code}@gmail.com` });
const group = (name, code, schedule, room) => ({ key: name, program: "Ingeniería", group: name, module: "Programación", schedule, room, students: [student(code)], expectedCount: 1 });

test("sync carries metadata for every matched group even without new students", () => {
  const courses = [{ id: "c", name: "Programación", semester: "2026-2", students: [student("1"), student("2")] }];
  const [action] = planCourseSync([group("A", "1", "LUN 16:00-18:00", "105"), group("B", "2", "MAR 10:00-12:00", "201")], courses, "2026-2");
  assert.equal(action.kind, "add");
  assert.equal(action.toAdd.length, 0);
  assert.deepEqual(action.campusGroups, [
    { key: "A", program: "Ingeniería", group: "A", schedule: "LUN 16:00-18:00", room: "105" },
    { key: "B", program: "Ingeniería", group: "B", schedule: "MAR 10:00-12:00", room: "201" },
  ]);
});

test("new courses carry their campus group metadata", () => {
  const [action] = planCourseSync([group("A", "1", "LUN", "105")], [], "2026-2");
  assert.equal(action.kind, "create");
  assert.deepEqual(action.campusGroups, [{ key: "A", program: "Ingeniería", group: "A", schedule: "LUN", room: "105" }]);
});
