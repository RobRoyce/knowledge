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

export async function openDocumentTab(page) {
  await page.getByText("Document", { exact: true }).click();
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

export async function openSettings(page, section) {
  await page.locator("i.pi-cog").first().click();
  await page.locator(".p-menuitem-link", { hasText: section }).click();
}
