/**
 * 迁移链占位。每个版本一个纯函数：vN 的 JSON 进、vN+1 的 JSON 出。
 * 加载工程时从文件声明的 schema_version 开始逐级 applyMigrate，
 * 最后再过当前版本的 zod schema。
 */
import { SCHEMA_VERSION } from "./schema.js";

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const migrations: Record<number, Migration> = {
  // 1 -> 2 的假迁移演练在 M6 补（加字段不改语义），验证旧工程无损打开。
};

export function migrateProject(raw: Record<string, unknown>): Record<string, unknown> {
  let version = typeof raw.schema_version === "number" ? raw.schema_version : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`工程版本 ${version} 比当前客户端支持的 ${SCHEMA_VERSION} 新`);
  }
  let current = raw;
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) {
      throw new Error(`缺少 schema v${version} -> v${version + 1} 的迁移函数`);
    }
    current = step(current);
    version += 1;
  }
  return current;
}
