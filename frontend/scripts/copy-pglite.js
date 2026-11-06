const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "node_modules", "@electric-sql", "pglite", "dist");
const destDir = path.join(__dirname, "..", "public", "pglite");
const files = ["pglite.wasm", "pglite.data"];

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = path.join(srcDir, file);
  if (!fs.existsSync(src)) {
    console.warn(`Skipping ${file}: not found at ${src}`);
    continue;
  }
  fs.copyFileSync(src, path.join(destDir, file));
}
