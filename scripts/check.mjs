import { readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:mjs|js)$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat().sort();
}

try {
  const files = (
    await Promise.all(
      ["src", "scripts"].map((directory) =>
        sourceFiles(resolve(root, directory)),
      ),
    )
  ).flat();
  let failures = 0;
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (result.error || result.status !== 0) {
      failures += 1;
      console.error(`Syntax check failed: ${relative(root, file)}`);
      console.error(result.error?.message ?? result.stderr.trim());
    }
  }
  if (failures > 0) process.exitCode = 1;
  else console.log(`Syntax checked ${files.length} JavaScript files.`);
} catch (error) {
  console.error(`Check failed: ${error.message}`);
  process.exitCode = 1;
}
