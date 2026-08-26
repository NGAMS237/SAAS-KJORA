import { copyFile, readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";

const exportRoot = path.resolve("out");

if (path.basename(exportRoot) !== "out" || path.dirname(exportRoot) !== process.cwd()) {
  throw new Error("Refusing to normalize a directory outside the project output folder.");
}

let normalizedFiles = 0;

async function flattenSegmentDirectory(routeDirectory, segmentDirectory, prefix, parts = []) {
  const entries = await readdir(segmentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(segmentDirectory, entry.name);

    if (entry.isDirectory()) {
      await flattenSegmentDirectory(routeDirectory, source, prefix, [...parts, entry.name]);
      continue;
    }

    const target = path.join(routeDirectory, [prefix, ...parts, entry.name].join("."));
    await copyFile(source, target);
    await unlink(source);
    normalizedFiles += 1;
  }
}

async function normalizeDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.name.startsWith("__next.")) {
      await flattenSegmentDirectory(directory, entryPath, entry.name);
      await rm(entryPath, { recursive: true, force: true });
      continue;
    }

    await normalizeDirectory(entryPath);
  }
}

await normalizeDirectory(exportRoot);
console.log(`Static export ready: ${normalizedFiles} Next.js segment file(s) normalized.`);
