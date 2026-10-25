import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exportResume } from "../src/lib/resume-export.ts";
import { parseBackgroundDocument } from "../src/lib/portfolio-ai.ts";
import { profile } from "../src/data/amin.ts";
import { loadResumeHints } from "./resume-hints.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.RESUME_SOURCE || resolve(homedir(), "Sources/resume-metadata/my-resume.yaml");
const hintsSource = resolve(root, process.env.RESUME_HINTS_SOURCE || "config/resume-hints.local.json");
const output = resolve(root, "src/data/generated/resume-context.json");
const report = resolve(root, "src/data/generated/resume-coverage.json");
const raw = Bun.YAML.parse(await readFile(source, "utf8"));
const result = exportResume(raw, {
  publicEmail: profile.email,
  reviewedAt: new Date().toISOString().slice(0, 10),
  // Optional owner-specific aliases stay outside tracked application code.
  // All professional narrative and achievements come from the external YAML.
  hints: await loadResumeHints(hintsSource, { required: !!process.env.RESUME_HINTS_SOURCE }),
});
// Fail before writing if the source identity/schema cannot be served by the app.
const document = parseBackgroundDocument(result.document);
await mkdir(dirname(output), { recursive: true });
for (const [destination, content] of [[output, document], [report, result.coverage]]) {
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(content, null, 2) + "\n");
  await rename(temporary, destination);
}
console.log(JSON.stringify({
  publicContextFacts: result.document.facts.length,
  professionalSourceLeaves: result.coverage.exportedLeaves,
  fullyVerifiedValues: result.coverage.verifiedValues,
  sourceLeaves: result.coverage.sourceLeaves,
  redactedFields: result.coverage.redacted,
  hiddenRecordsIncluded: result.coverage.hiddenRecords.length,
  missingFields: result.coverage.missing.length,
  output: "src/data/generated/resume-context.json",
}, null, 2));
