import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");

try {
  const requiredFiles = [
    "index.html",
    "src/main.js",
    "src/engine.js",
    "src/renderer.js",
    "src/style.css",
    "src/favicon.svg",
  ];
  await Promise.all(
    requiredFiles.map(async (file) => {
      if (!(await stat(resolve(root, file))).isFile())
        throw new Error(`Required asset is not a file: ${file}`);
    }),
  );
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(resolve(root, "index.html"), resolve(output, "index.html"));
  await cp(resolve(root, "src"), resolve(output, "src"), {
    recursive: true,
  });
  console.log(
    "Built Ashveil into dist/. Deploy that directory to any static web host.",
  );
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
