#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || process.cwd());
const packagePath = resolve(root, "package.json");
const candidates = [
  "index.html",
  "src",
  "examples",
  "app",
  "pages",
  "components",
  "public",
].map((path) => resolve(root, path));

const problems = [];
const notes = [];

if (existsSync(packagePath)) {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const dependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };
  if (dependencies["@hwyuanzi/liquid-glass-ui"]) {
    notes.push("package dependency found");
  } else {
    notes.push(
      "no package dependency found; checking for CDN or vendored usage",
    );
  }
}

const textFiles = [];
for (const candidate of candidates) {
  if (!existsSync(candidate)) continue;
  collect(candidate, textFiles);
}

const contents = textFiles
  .slice(0, 500)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

if (!/liquid-glass(?:-card|-button)?/.test(contents)) {
  problems.push("No LiquidGlass custom element usage was found.");
}
if (
  !/@hwyuanzi\/liquid-glass-ui|LiquidGlass-UI@[^/]+\/src\/liquid-glass|(?:^|["'])\.\.?\/src\/liquid-glass/m.test(
    contents,
  )
) {
  problems.push(
    "No package import, versioned CDN import, or vendored import was found.",
  );
}
if (/(?:href|link)\s*=\s*["']\s*javascript\s*:/i.test(contents)) {
  problems.push("Executable javascript: URL found in a UI attribute.");
}

if (problems.length) {
  console.error("Liquid Glass verification failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Liquid Glass verification passed (${textFiles.length} files scanned).`,
);
for (const note of notes) console.log(`  - ${note}`);

function collect(path, output) {
  const stat = statSync(path);
  if (stat.isFile()) {
    if (/\.(?:css|html|js|jsx|mjs|ts|tsx|vue|svelte)$/.test(path))
      output.push(path);
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    collect(resolve(path, entry.name), output);
  }
}
