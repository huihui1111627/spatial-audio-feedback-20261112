/**
 * M1 端到端冒烟：真实 Chromium 里验证
 * 1) 跨源隔离响应头生效、编辑器三栏渲染
 * 2) 播放启动 worklet 内 wasm 引擎，走带时钟持续推进
 * 3) 添加声源、撤销/重做链路无异常
 * 4) .sasproj 保存（下载）→ 修改 → 打开后场景回到保存时状态
 *
 * 直接用 playwright-core 写独立脚本，复用本机已缓存的浏览器，不重复下载。
 */
import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright-core";

const BASE_URL = process.env.SAS_BASE_URL ?? "http://localhost:5173";
const EXTERNAL_SERVER = Boolean(process.env.SAS_BASE_URL);

let devServer = null;

function startDevServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["dev"], {
      cwd: new URL("../..", import.meta.url).pathname,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => reject(new Error("dev server 启动超时")), 30_000);
    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes("Local:")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`dev server 提前退出 code=${code}`)));
  });
}

async function waitForText(page, text, timeoutMs = 15_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: timeoutMs });
}

async function sourceCount(page) {
  return page.evaluate(() => window.__sasGetProject?.().sources.length ?? -1);
}

async function main() {
  const step = (msg) => console.error(`[smoke ${(performance.now() / 1000).toFixed(1)}s] ${msg}`);
  if (!EXTERNAL_SERVER) {
    devServer = await startDevServer();
    // 给 vite 一点端口就绪缓冲。
    await new Promise((r) => setTimeout(r, 1000));
  }

  const browser = await chromium.launch({ headless: true });
  // 小视口：headless 用 swiftshader 软件渲染 WebGL，画布越小主线程越不被拖垮。
  const context = await browser.newContext({ viewport: { width: 480, height: 360 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  step("goto");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // 1. 跨源隔离与编辑器骨架
  if (!(await page.evaluate(() => globalThis.crossOriginIsolated))) {
    throw new Error("跨源隔离未生效：COOP/COEP 响应头配置有问题");
  }
  await waitForText(page, "Spatial Audio Studio");
  await waitForText(page, "测试声源");
  step("骨架渲染完成");

  // 2. 播放 → 引擎就绪 → 走带时钟推进
  await page.getByRole("button", { name: "播放" }).click();
  step("已点击播放");
  await waitForText(page, "引擎：就绪");
  step("引擎就绪");
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="transport-time"]');
      return el && el.textContent !== "00:00.0";
    },
    { timeout: 15_000 },
  );
  step("走带时钟推进");

  // 3. 添加声源 → 撤销 → 重做
  if ((await sourceCount(page)) !== 1) {
    throw new Error("初始场景应有 1 个声源");
  }
  await page.getByRole("button", { name: "添加声源" }).click();
  await waitForText(page, "声源 2");
  if ((await sourceCount(page)) !== 2) {
    throw new Error("添加声源后应有 2 个声源");
  }
  step("添加声源");
  await page.getByRole("button", { name: "撤销" }).click();
  await page.waitForFunction(
    () => window.__sasGetProject?.().sources.length === 1,
    { timeout: 5_000 },
  );
  await page.getByRole("button", { name: "重做" }).click();
  await page.waitForFunction(
    () => window.__sasGetProject?.().sources.length === 2,
    { timeout: 5_000 },
  );
  step("撤销/重做");

  // 4. 保存 → 再改 → 打开，场景必须回到保存时的样子
  const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  await page.getByRole("button", { name: "保存", exact: false }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  if (!savedPath) throw new Error("保存工程没有产生下载文件");
  step("保存工程");

  await page.getByRole("button", { name: "添加声源" }).click();
  await page.waitForFunction(
    () => window.__sasGetProject?.().sources.length === 3,
    { timeout: 5_000 },
  );

  await page.locator('[data-testid="open-project-input"]').setInputFiles(savedPath);
  await page.waitForFunction(
    () => window.__sasGetProject?.().sources.length === 2,
    { timeout: 5_000 },
  );
  step("打开工程回到保存状态");

  if (errors.length > 0) {
    throw new Error(`浏览器侧报错：\n${errors.join("\n")}`);
  }

  await browser.close();
  console.log(
    "✓ M1 冒烟通过：跨源隔离、引擎播放、走带时钟、增删/撤销/重做、工程保存打开全部正常",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (devServer) devServer.kill("SIGTERM");
  });
