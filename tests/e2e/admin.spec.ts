import { expect, test, type Page } from "@playwright/test";
import { expectSuccess, signInFresh } from "./helpers";

// Admin flows in order, one admin session. Uses: admin, FAC002 (as an assignee), section B.
test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signInFresh(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
});
test.afterAll(() => page.close());

test("academic setup: department, course, section assignment", async () => {
  await page.goto("/admin/academics/departments");
  await page.getByLabel("Code").fill("e2e");
  await page.getByLabel("Name").fill("End-to-End Studies");
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByText("Department E2E created")).toBeVisible();

  await page.goto("/admin/academics/courses");
  await page.getByLabel("Code").fill("e2e101");
  await page.getByLabel("Name").fill("Testing Fundamentals");
  await page.getByLabel("Department").selectOption({ label: "E2E — End-to-End Studies" });
  await page.getByRole("button", { name: "Add course" }).click();
  await expect(page.getByText("Course E2E101 created")).toBeVisible();

  await page.goto("/admin/academics/sections");
  await page.getByRole("link", { name: "BTECH-CSE · Sem 3 · B" }).click();
  await page.getByLabel("Course").selectOption({ label: "E2E101 — Testing Fundamentals" });
  await page.getByLabel("Faculty").selectOption({ label: "Prof. Rahul Mehta (FAC002)" });
  await page.getByRole("button", { name: "Assign course" }).click();
  await expect(page.getByText(/Course assigned · 10 student\(s\) enrolled/)).toBeVisible();
});

test("timetable: a slot is added once, the duplicate is a clash", async () => {
  await page.goto("/admin/timetable");
  await page.getByLabel("Section").selectOption({ label: "BTECH-CSE · Sem 3 · B" });
  await page.getByRole("button", { name: "Show" }).click();
  const addSlot = async () => {
    await page.getByLabel("Course & faculty").selectOption({ label: "E2E101 — Prof. Rahul Mehta" });
    await page.getByLabel("Room").selectOption({ label: "LH-102 (60)" });
    await page.getByLabel("Day", { exact: true }).selectOption({ label: "Saturday" });
    await page.getByLabel("Starts").fill("15:00");
    await page.getByLabel("Ends").fill("16:00");
    await page.getByRole("button", { name: "Add slot" }).click();
  };
  await addSlot();
  await expectSuccess(page);
  await addSlot();
  await expect(page.locator('[data-testid="form-error"]')).toContainText("Timetable clash");
});

test("CSV import: preview with errors, then commit", async () => {
  await page.goto("/admin/import");
  await page.waitForLoadState("networkidle"); // the file input is read by client code
  const header = "roll_number,name,email,phone,program_code,semester_no,section,admission_year";
  const upload = async (rows: string[]) => {
    await page.getByLabel("CSV file").setInputFiles({
      name: `students-${rows.length}-${Date.now()}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from([header, ...rows].join("\n")),
    });
    await page.getByRole("button", { name: "Preview" }).click();
  };

  await upload([
    "26CSE090,Test One,26cse090@college.edu,,BTECH-CSE,3,B,2025",
    "26CSE001,Dup,dup@college.edu,,BTECH-CSE,3,B,2025",
  ]);
  await expect(page.getByTestId("import-summary")).toContainText("1 with errors");
  await expect(page.getByText("roll_number: already exists")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Create/ })).toHaveCount(0);

  await upload([
    "26CSE090,Test One,26cse090@college.edu,,BTECH-CSE,3,B,2025",
    "26CSE091,Test Two,26cse091@college.edu,,BTECH-CSE,3,,2025",
  ]);
  await expect(page.getByTestId("import-summary")).toContainText("2 valid");
  await page.getByRole("button", { name: "Create 2 accounts" }).click();
  await expect(page.getByTestId("issued-credentials")).toContainText("2 temporary passwords");
});

test("audit log records the import", async () => {
  await page.goto("/admin/audit?action=user.created");
  await expect(page.getByTestId("audit-row")).toHaveCount(2);
  await page.getByTestId("audit-row").first().locator("summary").click();
  await expect(page.getByTestId("audit-row").first().locator("pre")).toContainText('"via": "csv"');
});
