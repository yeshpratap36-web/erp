import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadFaceFixtures, type FaceFixtures } from "./face-fixtures";
import { expectSuccess, newUserPage, signInFresh, todayKey } from "./helpers";

// Faculty-centred flows in order. Uses FAC001 and students 26CSE003–006 (section A).
test.describe.configure({ mode: "serial" });

let faculty: Page;
let fixtures: FaceFixtures | null = null;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000); // downloads public-domain fixtures on first run
  faculty = await browser.newPage();
  fixtures = await loadFaceFixtures(await browser.newPage());
  await signInFresh(faculty, "FAC001");
  await expect(faculty).toHaveURL(/\/faculty$/);
});
test.afterAll(() => faculty.close());

/** A student completes first login and declines face attendance (lands on the dashboard). */
async function onboardWithoutFace(browser: Browser, roll: string) {
  const page = await newUserPage(browser);
  await signInFresh(page, roll);
  await expect(page).toHaveURL(/\/onboarding\/consent$/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "I don't consent" }).click();
  await expect(page).toHaveURL(/\/student$/);
  return page;
}

test("students consent and enroll their faces", async ({ browser }) => {
  test.skip(!fixtures, "Face service or public-domain fixtures unavailable");
  test.setTimeout(180_000); // two students × five photos through the face service
  for (const [roll, person] of [
    ["26CSE003", "collins"],
    ["26CSE004", "armstrong"],
  ] as const) {
    const page = await newUserPage(browser);
    await signInFresh(page, roll);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "I agree — continue" }).click();
    await expect(page).toHaveURL(/\/onboarding\/face$/);

    const photo = await fixtures!.enrollment(person);
    for (const [i, angle] of ["front", "left", "right", "up", "down"].entries()) {
      // A new file name each time so the input always fires a change event.
      await page
        .getByTestId("face-file")
        .setInputFiles({ name: `${angle}.jpg`, mimeType: "image/jpeg", buffer: photo });
      await expect(page.locator('ol[aria-label="Photos"] li .bg-primary')).toHaveCount(i + 1, {
        timeout: 20_000,
      });
    }
    await page.getByRole("button", { name: "Finish enrollment" }).click();
    await expect(page).toHaveURL(/\/student$/);
    await page.context().close();
  }
});

test("faculty takes face attendance for an extra class and confirms it", async () => {
  test.skip(!fixtures, "Face service or public-domain fixtures unavailable");
  test.setTimeout(120_000);
  await faculty.goto("/faculty/timetable");
  await faculty.getByLabel("Course & section").selectOption({ label: "CS301 · BTECH-CSE 3A" });
  await faculty.getByLabel("Date").fill(todayKey());
  await faculty.getByLabel("Room").selectOption({ label: "LH-101" });
  await faculty.getByLabel("Starts").fill("21:00");
  await faculty.getByLabel("Ends").fill("21:30");
  await faculty.getByRole("button", { name: "Schedule" }).click();
  await expectSuccess(faculty);

  await faculty.goto("/faculty");
  const extra = faculty.locator("li", { hasText: "21:00" }).filter({ hasText: "CS301" });
  await extra.getByRole("button", { name: "Take attendance" }).click();
  await expect(faculty).toHaveURL(/\/faculty\/sessions\//);

  // Two enrolled students and one stranger.
  await faculty.getByTestId("classroom-photos").setInputFiles({
    name: "class.jpg",
    mimeType: "image/jpeg",
    buffer: await fixtures!.classroom(["collins", "armstrong", "aldrin"]),
  });
  await expect(faculty.getByTestId("photo-card")).toContainText("2 matched", { timeout: 45_000 });
  await expect(faculty.getByTestId("photo-card")).toContainText("1 unknown");
  await expect(faculty.getByTestId("student-26CSE003")).toContainText("Face");
  await expect(faculty.getByTestId("student-26CSE004")).toContainText("Face");

  // With photos, every student already has a default (matched → present, not detected →
  // absent), so nothing is left undecided and the form can be confirmed as is.
  await expect(faculty.getByTestId("review-summary")).not.toContainText("to decide");
  await faculty.getByRole("button", { name: "Confirm attendance" }).click();
  await expect(faculty.getByText(/Confirmed by Dr\. Anita Rao/)).toBeVisible();
});

test("marks entered and published by faculty reach the student", async ({ browser }) => {
  const student = await onboardWithoutFace(browser, "26CSE005");

  await faculty.goto("/faculty");
  await faculty
    .locator("a", { hasText: "CS301 — Data Structures" })
    .filter({ hasText: "3A" })
    .click();
  await faculty.getByRole("link", { name: "Marks & grades" }).click();
  await faculty.getByLabel("Name").fill("E2E Quiz");
  await faculty.getByLabel("Maximum marks").fill("10");
  await faculty.getByLabel("Weightage (%)").fill("10");
  await faculty.getByRole("button", { name: "Add assessment" }).click();
  await expectSuccess(faculty);

  await faculty.getByRole("link", { name: "E2E Quiz" }).click();
  const inputs = faculty.locator('input[inputmode="decimal"]');
  await expect(inputs.first()).toBeVisible(); // count() doesn't wait for the grid to render
  for (let i = 0; i < (await inputs.count()); i++) await inputs.nth(i).fill("7");
  await faculty.getByTestId("marks-26CSE005").locator('input[inputmode="decimal"]').fill("9");
  await faculty.getByRole("button", { name: "Save marks" }).click();
  await expect(faculty.getByText("All students have marks")).toBeVisible();
  faculty.once("dialog", (d) => d.accept());
  await faculty.getByRole("button", { name: "Publish marks to students" }).click();
  await expect(faculty.getByRole("button", { name: "Unpublish" })).toBeVisible();

  await student.goto("/student/results");
  await expect(student.locator("li", { hasText: "CS301" })).toContainText("9 / 10");
  await student.context().close();
});

test("leave request approved by faculty", async ({ browser }) => {
  const student = await onboardWithoutFace(browser, "26CSE006");
  await student.goto("/student/requests");
  await student.getByLabel("From").fill(todayKey());
  await student.getByLabel("To").fill(todayKey());
  await student
    .locator('textarea[name="reason"]')
    .first()
    .fill("Family function — will be back tomorrow.");
  await student.getByRole("button", { name: "Send request" }).first().click();
  await expect(student.getByText("Leave request sent")).toBeVisible();

  await faculty.goto("/faculty/requests");
  const row = faculty.getByTestId("pending-leave").filter({ hasText: "26CSE006" });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(faculty.getByText(/approved.*26CSE006/i)).toBeVisible();

  await student.goto("/student/requests");
  await expect(student.getByTestId("my-request").first()).toContainText("approved");
  await student.context().close();
});
