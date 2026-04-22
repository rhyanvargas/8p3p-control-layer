/**
 * better-sqlite3 is native: the .node binary must match the current Node ABI.
 * If the last npm install was under a different Node, loading fails with
 * NODE_MODULE_VERSION / ERR_DLOPEN_FAILED. We rebuild only when that happens.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

function canLoad() {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch (err) {
    return err;
  }
}

const first = canLoad();
if (first === true) {
  process.exit(0);
}

const message = String(first?.message ?? first ?? "");
const likelyAbiMismatch =
  /NODE_MODULE_VERSION|compiled against a different Node|ERR_DLOPEN_FAILED|invalid ELF header|Incompatible version/i.test(
    message,
  );

if (!likelyAbiMismatch) {
  console.error(first);
  process.exit(1);
}

console.warn(
  "[ensure-better-sqlite3] Native module out of date for this Node; running npm rebuild better-sqlite3 ...",
);
const r = spawnSync("npm", ["rebuild", "better-sqlite3"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

const second = canLoad();
if (second === true) {
  process.exit(0);
}
console.error("[ensure-better-sqlite3] Rebuild did not fix loading better-sqlite3:");
console.error(second);
process.exit(1);
