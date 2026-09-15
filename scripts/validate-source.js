/* Lightweight release validation that needs no extra lint dependency. */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const skip = new Set(["node_modules", ".git", "reference"]);
const exts = new Set([".ts", ".tsx"]);
const files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (exts.has(path.extname(name))) files.push(full);
  }
}
walk(root);
let failed = false;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const scriptKind = path.extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, scriptKind);
  const errors = sf.parseDiagnostics || [];
  if (errors.length) {
    failed = true;
    console.error(`\n${path.relative(root, file)}`);
    for (const error of errors) console.error(ts.flattenDiagnosticMessageText(error.messageText, " "));
  }
}
if (failed) process.exit(1);
console.log(`Source syntax validation passed: ${files.length} TypeScript/TSX files.`);
