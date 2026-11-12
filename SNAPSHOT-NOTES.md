# 评测快照说明（评估时整理）

本仓库保存 Claude Code 会话 c68b2d8c-2f9c-4a07-aec8-0ee6b87b2482 的项目源码快照。

- 第一个提交：本轮开始前已有的 M0 源码，共 71 个文件。原项目没有历史 Git 提交，因此根据前一会话 35220b86-1440-4f84-a7c9-a07d7a6b59f4 的成功 Write/Edit 记录还原，并与本轮首次 Read 交叉核对。
- 第二个提交：本轮实际交付，共 99 个原始源码与生成文件。91 个能从读写轨迹重放的文件与实际目录逐字节一致；其余为现存锁文件、生成的 WASM/绑定及构建元数据。
- 初始版本的历史 pnpm-lock.yaml、Cargo.lock 与生成 WASM 无原始副本，初始提交不包含它们，也没有将最终版本的这些文件倒填到初始提交。初始源码可以按其 Cargo/pnpm 配置重新构建。
- 本说明由评估时添加，原始实现未修复、未补功能。没有上传会话日志、录屏、账号数据或评估诊断脚本。

## 启动产物快照

需要 Node.js 22+ 和 pnpm。在第二个提交对应的目录运行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @spatial/web dev --host 127.0.0.1 --port 5173
```

产物提交包含交付时的 WASM 和 JS/TypeScript 绑定。需要重新构建它们时，安装 Rust stable、wasm32-unknown-unknown target 和 wasm-pack 后运行 `pnpm wasm:build`。

此实现只完成 M1 编辑/播放/工程管理。轨迹、空间声学、HRTF/SOFA、离线双耳、5.1 以及长音频分段渲染尚未交付。
