// usage: node capture.cjs <scenarios.cjs> <outDir> [scenarioName...]
// シナリオを 1 つずつ新しいブラウザコンテキストで開き、<outDir>/<name>.png に撮る。
// シナリオが locator を返したときは、その要素の周辺を <name>-crop.png にも切り出す。
// 失敗したシナリオは、そのときの画面を _failed-<name>.png に残して次へ進む。
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const home =
  process.env.HIRES_CAPTURE_HOME ??
  path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "hires-capture");
const { chromium } = require(path.join(home, "node_modules", "playwright-core"));

const [scenarioFile, outDir, ...names] = process.argv.slice(2);
if (scenarioFile === undefined || outDir === undefined) {
  console.error("usage: node capture.cjs <scenarios.cjs> <outDir> [scenarioName...]");
  process.exit(2);
}
const config = require(path.resolve(scenarioFile));
const width = Number(process.env.WIDTH ?? config.viewport?.width ?? 1280);
const height = Number(process.env.HEIGHT ?? config.viewport?.height ?? 800);
const scale = Number(process.env.SCALE ?? config.deviceScaleFactor ?? 2);
const cropPadding = config.cropPadding ?? 16;
const targets = names.length > 0 ? names : Object.keys(config.scenarios);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 毎回新しいコンテキストなのでログインは毎回通る。config.login が画面ごとのログイン手順を持つ。
const open = async (page, url) => {
  await page.goto(new URL(url, config.baseUrl).toString());
  await page.waitForLoadState("networkidle").catch(() => {});
  if (config.login !== undefined) {
    await config.login(page, { sleep });
  }
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  let failed = 0;
  for (const name of targets) {
    const scenario = config.scenarios[name];
    if (scenario === undefined) {
      console.error("unknown scenario", name);
      failed += 1;
      continue;
    }
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      // 自己署名証明書のローカル proxy を開けるようにする
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    try {
      const focus = await scenario(page, { open: (url) => open(page, url), sleep });
      // 非同期の再描画やトーストが落ち着くのを待つ
      await sleep(config.settleMs ?? 1000);
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: config.fullPage === true });
      console.log("saved", file);
      const box = focus == null ? null : await focus.boundingBox();
      if (box !== null) {
        const crop = path.join(outDir, `${name}-crop.png`);
        await page.screenshot({
          path: crop,
          clip: {
            x: Math.max(0, box.x - cropPadding),
            y: Math.max(0, box.y - cropPadding),
            width: box.width + cropPadding * 2,
            height: box.height + cropPadding * 2,
          },
        });
        console.log("saved", crop);
      }
    } catch (error) {
      failed += 1;
      console.error("failed", name, error.message);
      await page.screenshot({ path: path.join(outDir, `_failed-${name}.png`) }).catch(() => {});
    }
    await context.close();
  }
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
