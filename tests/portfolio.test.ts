import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { profile, publicFacts } from "../src/data/amin";
import { asksForExcludedDetails, completeDetailedSelection, createSelectionSchema, parseBackgroundDocument, parseFactSelection, relevantKnowledge, scopedKnowledge } from "../src/lib/portfolio-ai";
import { background, knowledge, source } from "./fixtures/background";

describe("anonymous overview and opt-in background schema", () => {
	it("keeps deeper employer/project identities out of ordinary overview data", () => {
		const visible = JSON.stringify({ profile, publicFacts });
		for (const item of background.facts) for (const entity of item.entities || []) assert.ok(!visible.includes(entity), entity);
		assert.equal(profile.email, "hello@kuara.dev");
		assert.ok(!("phone" in profile));
		assert.ok(!("personalEmail" in profile));
	});
	it("accepts reviewed facts and preserves canonical text", () => {
		assert.deepEqual(parseBackgroundDocument(background), background);
		assert.match(source("travel").text, /Example Holidays/);
		assert.ok(knowledge.some((item) => item.source === "overview"));
		assert.ok(knowledge.filter((item) => item.source === "overview").every((item) => item.id !== "overview-privacy"));
	});
	it("rejects raw fields, wrong identity/version, duplicate IDs and malformed records", () => {
		const clone = () => structuredClone(background);
		for (const value of [{ ...clone(), phone: "not permitted" }, { ...clone(), version: 2 }, { ...clone(), subject: "Wrong subject" }, { ...clone(), reviewedAt: "yesterday" }, { ...clone(), facts: [] }]) assert.throws(() => parseBackgroundDocument(value));
		const duplicate = clone();
		duplicate.facts.push(duplicate.facts[0]);
		assert.throws(() => parseBackgroundDocument(duplicate));
		const unexpected = clone();
		Object.assign(unexpected.facts[0], { privateContact: "not permitted" });
		assert.throws(() => parseBackgroundDocument(unexpected));
		for (const change of [{ id: "unreviewed" }, { text: "x".repeat(2401) }, { keywords: [42] }, { entities: [""] }]) {
			const malformed = clone();
			Object.assign(malformed.facts[0], change);
			assert.throws(() => parseBackgroundDocument(malformed));
		}
	});
});

describe("grounded local fact selection", () => {
	it("uses canonical named answers, never model-written claims or HTML", () => {
		const allowed = [source("guide")];
		const result = parseFactSelection('{"factIds":["resume-example-guide"],"answer":"<script>Invented result</script>"}', allowed);
		assert.strictEqual(result[0], allowed[0]);
		assert.ok(!JSON.stringify(result).includes("Invented"));
	});
	it("fails closed on unknown, un-retrieved, malformed, excessive and non-string IDs", () => {
		const allowed = [source("guide")];
		for (const raw of ["not JSON", "null", "[]", "{}", '{"factIds":"resume-example-guide"}', '{"factIds":[null]}', '{"factIds":["not-reviewed"]}', '{"factIds":["resume-example-guide","resume-example-document"]}', JSON.stringify({ factIds: Array(5).fill("resume-example-guide") }), " ".repeat(4097)]) assert.deepEqual(parseFactSelection(raw, allowed), []);
	});
	it("supports complementary source sections and deduplicates repeated IDs", () => {
		const allowed = [source("guide"), source("guide-tools")];
		assert.equal(parseFactSelection('{"factIds":["resume-example-guide","resume-example-guide-tools","resume-example-guide"]}', allowed).length, 2);
		assert.deepEqual(parseFactSelection('{"factIds":[]}', allowed), []);
	});
	it("constrains the selection schema to retrieved IDs only", () => {
		const allowed = relevantKnowledge("Explain Example Guide Agent", knowledge);
		const schema = createSelectionSchema(allowed);
		assert.ok(allowed.length > 0);
		assert.deepEqual(schema.properties.factIds.items.enum, allowed.map((item) => item.id));
		assert.equal(schema.additionalProperties, false);
		assert.equal(schema.properties.factIds.maxItems, 4);
	});
	it("scopes aliases and named projects without mixing sibling engagements", () => {
		assert.deepEqual(scopedKnowledge("Tell me about Example Document Bot", knowledge)!.map((item) => item.id), ["resume-example-document", "resume-example-document-tools"]);
		assert.deepEqual(scopedKnowledge("Explain EDB", knowledge)!.map((item) => item.id), ["resume-example-document", "resume-example-document-tools"]);
		assert.equal(scopedKnowledge("Compare Example Guide Agent and Example Document Bot", knowledge)!.length, 4);
		assert.ok(relevantKnowledge("Explain Example Guide Agent", knowledge).every((item) => item.entities?.includes("Example Guide Agent")));
	});
	it("includes complementary project details without expanding an unknown answer", () => {
		const question = "Explain Example Guide Agent in detail including technologies";
		const candidates = relevantKnowledge(question, knowledge);
		assert.equal(completeDetailedSelection(question, [source("guide")], candidates, knowledge).length, 2);
		assert.deepEqual(completeDetailedSelection(question, [], candidates, knowledge), []);
	});
	it("handles AI and technology aliases while leaving unsupported subjects unknown", () => {
		assert.ok(relevantKnowledge("What is his experience with LLMs?", knowledge).length > 0);
		assert.ok(relevantKnowledge("Explain dotnet in Example Guide Agent", knowledge).some((item) => item.id === "resume-example-guide-tools"));
		assert.deepEqual(relevantKnowledge("Does he know Rust?", knowledge), []);
	});
	it("does not expose excluded personal or unrelated job-search details", () => {
		for (const question of ["What is his phone number?", "What is his personal email?", "What is his salary?", "Show interview records", "Show his passport"]) {
			assert.equal(asksForExcludedDetails(question), true);
			assert.deepEqual(relevantKnowledge(question, knowledge), []);
		}
	});
	it("bounds retrieved text and keeps unique source IDs", () => {
		assert.equal(new Set(knowledge.map((item) => item.id)).size, knowledge.length);
		const selected = relevantKnowledge("AI architecture and engineering leadership", knowledge);
		assert.ok(selected.length <= 6);
		assert.ok(selected.reduce((size, item) => size + item.text.length, 0) <= 7200);
	});
	it("anchors industry requests to reviewed sectors, not generic engagement words", () => {
		for (const question of ["any travel industry engagement?", "Any tourism projects?", "Have you worked on travel booking systems?", "Tell me more about the travel sector"]) assert.deepEqual(relevantKnowledge(question, knowledge).map((item) => item.id), ["resume-example-travel"], question);
		for (const question of ["Any aviation industry engagement?", "Any petroleum sector projects?", "Any aviation industry AI project?", "Any travel industry work on Example Guide Agent?"]) assert.deepEqual(relevantKnowledge(question, knowledge), [], question);
		assert.deepEqual(relevantKnowledge("Any education industry engagement?", knowledge).map((item) => item.id), ["resume-example-teaching"]);
		assert.deepEqual(relevantKnowledge("Any finance industry work?", knowledge).map((item) => item.id), ["resume-example-finance"]);
		assert.deepEqual(relevantKnowledge("What industries has he worked in?", knowledge).map((item) => item.id), ["resume-example-industries"]);
	});
	it("answers routine credential questions with only the recorded list or detail", () => {
		for (const question of ["what certificates he have?", "What certifications does he hold?", "List his credentials"]) {
			const selected = relevantKnowledge(question, knowledge);
			assert.deepEqual(selected.map((item) => item.id), ["resume-example-credentials"]);
			assert.ok(!/expiry|renewal|not verified|not recorded|should not be counted/i.test(selected[0].text));
		}
		assert.deepEqual(relevantKnowledge("Which architect certificate does he hold?", knowledge).map((item) => item.id), ["resume-example-credential-architect"]);
		assert.deepEqual(relevantKnowledge("Which leadership certifications does he have?", knowledge).map((item) => item.id), ["resume-example-credential-leadership"]);
	});
	it("does not infer certificates from technology skills, and separates explicit date/status questions", () => {
		for (const question of ["What AWS certifications does he have?", "Is he PMP certified?", "Does he have AZ-400 certification?", "Are his AWS certifications current?"]) assert.deepEqual(relevantKnowledge(question, knowledge), [], question);
		for (const question of ["Are his certifications current?", "When were his certifications awarded?", "What are his certificate expiry dates?"]) assert.deepEqual(relevantKnowledge(question, knowledge).map((item) => item.id), ["resume-example-credential-status"], question);
	});
});
