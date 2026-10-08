/*
 * User-level steps for the Knowledge UI. Each step uses the visible
 * controls a person would use.
 */

const TIMEOUT = 15000;

export async function createProject(page, name, description = "") {
  await page.locator("button.create-project").click();
  const dialog = page
    .locator(".p-dialog")
    .filter({ hasText: "Create Project" });
  await dialog.locator("input").first().fill(name);
  if (description) {
    await dialog.locator("textarea").fill(description);
  }
  await dialog.locator("button", { hasText: "Create" }).click();
  await page
    .locator("p-tree, .p-tree")
    .getByText(name, { exact: true })
    .first()
    .waitFor({ timeout: TIMEOUT });
}

/** Add a website through the Web Import dialog into the current project. */
export async function addLinkToProject(page, url, expectedTitle) {
  await page.locator("app-create button").nth(2).click();
  const input = page.locator("app-import-web input#linkInput");
  await input.fill(url);
  await input.press("Enter");
  await page
    .locator("app-import-web table input")
    .first()
    .waitFor({ timeout: TIMEOUT });
  if (expectedTitle) {
    await page.waitForFunction(
      (title) =>
        [...document.querySelectorAll("app-import-web table input")].some(
          (i) => i.value === title
        ),
      expectedTitle,
      { timeout: TIMEOUT }
    );
  }
  await page
    .locator("app-import-web p-selectbutton .p-button", { hasText: "Project" })
    .click();
  await page.locator("app-import-web button", { hasText: "Import" }).click();
}

/** Import files into the Inbox, then move all Inbox items to the current project. */
export async function importFilesToProject(page, files) {
  await page.locator("app-create input[type=file]").setInputFiles(files);
  for (const file of files) {
    const name = file.split("/").pop();
    await page.getByText(name).first().waitFor({ timeout: TIMEOUT });
  }
  await page.getByText("Import All").click();
  await page.locator("button", { hasText: "Import" }).first().click();
}

/** Show the Inbox (keyboard shortcut Cmd+1 / Ctrl+1). */
export async function openInbox(page) {
  await page.locator("body").click({ position: { x: 5, y: 600 } });
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+1" : "Control+1"
  );
  await page.locator("app-home").first().waitFor({ timeout: TIMEOUT });
}

/** Select a project in the project tree. */
export async function selectProject(page, name) {
  await page
    .locator("p-tree, .p-tree")
    .getByText(name, { exact: true })
    .first()
    .click();
  await page.locator("i.pi-table").first().waitFor({ timeout: TIMEOUT });
}

export async function openTable(page) {
  await page.locator("i.pi-table").first().click();
  await page
    .locator("app-ks-table, p-table")
    .first()
    .waitFor({ timeout: TIMEOUT });
}

export async function tableTitles(page) {
  return page.locator("p-table tbody tr td:nth-child(3)").allInnerTexts();
}

export async function openSource(page, title) {
  await page.getByText(title, { exact: true }).first().dblclick();
  await page
    .locator(".p-dialog, app-source")
    .getByText(title)
    .first()
    .waitFor({ timeout: TIMEOUT });
}

/**
 * Close the open source dialog. An embedded PDF viewer keeps keyboard
 * focus, so take focus away from it before pressing Escape. Use the close
 * icon if Escape does not work.
 */
export async function closeDialog(page) {
  const dialog = page.locator("p-dynamicdialog");
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    document.body.focus();
  });
  await page.keyboard.press("Escape");
  try {
    await dialog.first().waitFor({ state: "detached", timeout: 3000 });
  } catch {
    await dialog.locator(".pi-times").first().click();
    await dialog.first().waitFor({ state: "detached", timeout: 5000 });
  }
}

export async function addAnnotation(page, key, value) {
  await page.locator('input[placeholder="Tag"]').fill(key);
  const valueInput = page.locator('input[placeholder="Value"]');
  await valueInput.fill(value);
  await valueInput.press("Enter");
}

export async function addTopic(page, topic) {
  const input = page.locator(
    'input[placeholder="Start typing to add a topic..."]'
  );
  await input.fill(topic);
  await input.press("Enter");
}

/** The Document tab of the open source dialog. */
export async function openDocumentTab(page) {
  await page.getByRole("dialog").getByText("Document", { exact: true }).click();
}

/** Type into the global search box and return the suggestion texts. */
export async function search(page, query) {
  const input = page.locator("input.p-autocomplete-input");
  await input.click();
  await input.fill("");
  await input.type(query, { delay: 30 });
  await page
    .locator(".p-autocomplete-panel li")
    .first()
    .waitFor({ timeout: TIMEOUT });
  await page.waitForTimeout(500);
  return page
    .locator(".p-autocomplete-panel li")
    .evaluateAll((items) =>
      items.map((i) => i.innerText.replace(/\s+/g, " ").trim())
    );
}

/** Open a Settings section. Settings is a dialog; reuse it if it is open. */
export async function openSettings(page, section) {
  const item = page.locator(".p-menuitem-link", { hasText: section });
  if (!(await item.isVisible())) {
    await page.locator("i.pi-cog").first().click();
  }
  await item.click();
}

/**
 * Restore a library backup through Settings > Backup. Returns the preview
 * text that the user sees before confirmation.
 */
export async function restoreLibrary(page, tar) {
  await openSettings(page, "Backup");
  await page.locator("#restore-library-input").setInputFiles(tar);
  const preview = page.locator("#restore-preview");
  await preview.waitFor({ timeout: 60000 });
  const text = await preview.innerText();
  await page.locator("#restore-confirm").click();
  await page.locator("#restore-result").waitFor({ timeout: 60000 });
  const result = await page.locator("#restore-result").innerText();
  // The app reloads after a restore
  await page.waitForEvent("load", { timeout: 15000 });
  await page.waitForSelector("app-create button", { timeout: 30000 });
  return { preview: text, result };
}

/** Upload a library backup that the service must refuse. Returns the error. */
export async function restoreLibraryError(page, tar) {
  await openSettings(page, "Backup");
  await page.locator("#restore-library-input").setInputFiles(tar);
  const error = page.locator("#restore-error");
  await error.waitFor({ timeout: 60000 });
  return error.innerText();
}
