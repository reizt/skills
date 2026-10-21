// capture.cjs に渡すシナリオファイルの例。作業ごとに scratchpad へ複製して書き換える。
// シナリオは (page, { open, sleep }) を受け取り、切り出したい要素の locator を返せる（返さなければ全体だけ撮る）。
module.exports = {
  baseUrl: "https://localhost:8443",
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,

  // ログイン画面に飛ばされたときの手順。不要なら消す。
  login: async (page) => {
    const button = page.getByRole("button", { name: "このオペレーターでログイン" });
    if (!(await button.isVisible().catch(() => false))) return;
    await button.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
    await page.waitForLoadState("networkidle").catch(() => {});
  },

  scenarios: {
    "customer-list": async (page, { open }) => {
      await open("/customers?q=テスト");
      await page.getByText("テスト顧客").first().waitFor({ timeout: 20000 });
    },
    "drawer-facility-tab": async (page, { open }) => {
      await open("/members/1/matching");
      await page.getByRole("button", { name: /^検索/ }).last().click();
      const card = page.getByText("テスト施設", { exact: true }).first();
      await card.waitFor({ timeout: 20000 });
      // 一覧が非同期に描き直されるので、通信が止むのを待ってから押す。固定の sleep では待たない
      await page.waitForLoadState("networkidle");
      await card.click();
      await page.getByRole("tab", { name: "施設" }).first().click();
      const link = page.getByText("施設詳細画面を開く");
      await link.waitFor({ timeout: 20000 });
      // 注記を含むセクションを切り出す
      return link.locator("xpath=ancestor::section[1]");
    },
  },
};
