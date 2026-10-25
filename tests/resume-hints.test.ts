import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadResumeHints, parseResumeHints } from "../scripts/resume-hints";

describe("optional external résumé hint metadata", () => {
	it("accepts only bounded title, entity and keyword labels", () => {
		assert.deepEqual(parseResumeHints([{ title: " Example Project ", entities: ["EP", "EP"], keywords: ["sector:travel", " booking "] }]), [
			{ title: "Example Project", entities: ["EP"], keywords: ["sector:travel", "booking"] },
		]);
		assert.deepEqual(parseResumeHints([]), []);
		assert.deepEqual(parseResumeHints([{ title: "Example Project", keywords: [] }]), [{ title: "Example Project", keywords: [] }]);
	});
	it("rejects narrative, unexpected fields, invalid records and oversized metadata", () => {
		for (const value of [null, {}, [null], [{ title: "Project", keywords: [], text: "Old résumé paragraph" }], [{ title: "Project", keywords: [], phone: "not-permitted" }], [{ title: "", keywords: [] }], [{ title: "Project", keywords: [42] }], [{ title: "Project", keywords: [], entities: [""] }], [{ title: "x".repeat(161), keywords: [] }], [{ title: "Project", keywords: ["x".repeat(101)] }], [{ title: "Project", keywords: Array(25).fill("keyword") }], [{ title: "Project", keywords: [], entities: Array(17).fill("entity") }], Array(601).fill({ title: "Project", keywords: [] })]) {
			assert.throws(() => parseResumeHints(value));
		}
	});
	it("loads the fictional schema example without requiring owner data", async () => {
		const path = fileURLToPath(new URL("../config/resume-hints.example.json", import.meta.url));
		const hints = await loadResumeHints(path, { required: true });
		assert.equal(hints[0].title, "Example Travel Planner");
		assert.ok(hints[0].keywords.includes("sector:travel"));
	});
	it("allows an absent default file but fails for an explicitly configured missing file", async () => {
		const path = fileURLToPath(new URL(`./missing-${randomUUID()}.json`, import.meta.url));
		assert.deepEqual(await loadResumeHints(path), []);
		await assert.rejects(loadResumeHints(path, { required: true }), { code: "ENOENT" });
	});
	it("does not silently ignore invalid content in an existing optional file", async () => {
		const invalidShape = fileURLToPath(new URL("../package.json", import.meta.url));
		await assert.rejects(loadResumeHints(invalidShape), /must be an array/);
		const invalidJSON = fileURLToPath(new URL("../.env.example", import.meta.url));
		await assert.rejects(loadResumeHints(invalidJSON), SyntaxError);
	});
});
