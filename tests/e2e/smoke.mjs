/**
 * M0 端到端冒烟：真实 Chromium 里验证
 * 1) 跨源隔离响应头生效、能力面板渲染
 * 2) worklet 内 wasm EngineSession 启动并持续处理音频块（心跳增长）
 * 3) 增益调节链路无异常
 * 4) .sasproj 浏览器内打包/解包自检通过
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

async function waitForText(page, text, timeoutMs = 10_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: timeoutMs });
}

async function main() {
  if (!EXTERNAL_SERVER) {
    devServer = await startDevServer();
    // 给 vite 一点端口就绪缓冲。
    await new Promise((r) => setTimeout(r, 1000));
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // 1. 跨源隔离与能力面板
  if (!(await page.evaluate(() => globalThis.crossOriginIsolated))) {
    throw new Error("跨源隔离未生效：COOP/COEP 响应头配置有问题");
  }
  await waitForText(page, "AudioWorklet");
  await waitForText(page, "可用");

  // 2. 启动 worklet 内 wasm 引擎
  await page.getByRole("button", { name: "启动引擎" }).click();
  await waitForText(page, "状态：ready", 15_000);

  // 音频块持续累加（心跳）
  await page.getByRole("button", { name: "查询心跳" }).click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".tabular-nums");
      return el && /已处理块数：[1-9]/.test(el.textContent ?? "");
    },
    { timeout: 10_000 },
  );
  const firstHeartbeat = await page.locator(".tabular-nums").first().innerText();

  // 3. 调增益并再查一次心跳，确认链路持续工作
  await page.locator('input[type="range"]').fill("0.7");
  await page.getByRole("button", { name: "查询心跳" }).click();
  await page.waitForTimeout(300);
  const secondHeartbeat = await page.locator(".tabular-nums").first().innerText();
  if (secondHeartbeat === firstHeartbeat) {
    throw new Error(`心跳没有增长：${firstHeartbeat}`);
  }

  // 4. 工程文件打包解包自检
  await page.getByRole("button", { name: "浏览器内打包 → 解包自检" }).click();
  await waitForText(page, "打包解包通过");

  if (errors.length > 0) {
    throw new Error(`浏览器侧报错：\n${errors.join("\n")}`);
  }

  await browser.close();
  console.log("✓ M0 冒烟通过：跨源隔离、worklet wasm 心跳、增益链路、工程自检全部正常");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (devServer) devServer.kill("SIGTERM");
  });
