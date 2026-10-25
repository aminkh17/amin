import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { relevantKnowledge, resolveQuestionTopic } from "../src/lib/portfolio-ai";
import { MAX_PROMPT_BYTES, answerFromReviewedSources, buildSelectionRequest, classifyGuideIssue, recoveryNotice } from "../src/lib/portfolio-guide";
import { knowledge, source } from "./fixtures/background";

const recentQuestion = "tell me more about recent projects";

describe("fresh topics and focused follow-ups", () => {
	it("starts a fresh topic for recent projects, even after a named engagement", () => {
		assert.equal(relevantKnowledge(recentQuestion, knowledge)[0].id, "resume-example-recent");
		assert.deepEqual(resolveQuestionTopic(recentQuestion, "Explain Example Guide Agent", knowledge), { question: recentQuestion, followUp: false });
	});
	it("does not merge a new named project into the previous project", () => {
		const question = "Tell me more about Example Document Bot";
		assert.deepEqual(resolveQuestionTopic(question, "Explain Example Guide Agent", knowledge), { question, followUp: false });
		assert.equal(resolveQuestionTopic("Tell me more about its deployment", "Explain Example Guide Agent", knowledge).followUp, true);
		const travel = "Tell me more about travel industry engagements";
		assert.deepEqual(resolveQuestionTopic(travel, recentQuestion, knowledge), { question: travel, followUp: false });
	});
	it("keeps recent projects and a subsequent travel question independent", async () => {
		const recent = await answerFromReviewedSources(recentQuestion, "Explain Example Guide Agent", knowledge, async () => '{"factIds":["resume-example-recent"]}');
		assert.deepEqual(recent.facts.map((item) => item.id), ["resume-example-recent"]);
		assert.equal(recent.nextTopic, recentQuestion);
		const question = "any travel industry engagement?";
		const travel = await answerFromReviewedSources(question, recent.nextTopic, knowledge, async () => '{"factIds":["resume-example-travel"]}');
		assert.deepEqual(travel.facts.map((item) => item.id), ["resume-example-travel"]);
		assert.match(travel.facts[0].text, /Example Holidays/);
		assert.ok(!travel.facts[0].text.includes("Example Guide Agent"));
	});
	it("does not return to an old engagement after an unsupported new-sector question", async () => {
		const question = "Any aviation industry engagement?";
		const unknown = await answerFromReviewedSources(question, recentQuestion, knowledge, null);
		assert.deepEqual(unknown.facts, []);
		assert.equal(unknown.nextTopic, question);
		const followUp = await answerFromReviewedSources("Tell me more", unknown.nextTopic, knowledge, null);
		assert.deepEqual(followUp.facts, []);
	});
	it("handles a credential-status follow-up without repeating the list or claiming validity", async () => {
		const previous = "what certificates he have?";
		assert.equal(resolveQuestionTopic("Are they current?", previous, knowledge).followUp, true);
		const result = await answerFromReviewedSources("Are they current?", previous, knowledge, null);
		assert.deepEqual(result.facts.map((item) => item.id), ["resume-example-credential-status"]);
		assert.match(result.facts[0].text, /not recorded/);
		assert.ok(!result.facts[0].text.includes("Example Cloud"));
	});
});

describe("bounded stateless model selections", () => {
	it("caps the entire request, including source JSON and schema, in UTF-8 bytes", () => {
		const built = buildSelectionRequest("Tell me about my experience", knowledge)!;
		assert.ok(built.candidates.length > 0);
		assert.ok(new TextEncoder().encode(JSON.stringify(built.request)).length <= MAX_PROMPT_BYTES);
		assert.ok(built.candidates.length < knowledge.length);
		assert.equal(built.request.messages.length, 2);
	});
	it("never truncates canonical source text to make it fit", () => {
		const facts = [{ ...source("guide"), text: "資料".repeat(1000) }];
		assert.equal(buildSelectionRequest("Explain", facts), null);
	});
	it("uses reviewed local sources if a full source cannot fit", async () => {
		const facts = [{ ...source("guide"), title: "Sample topic", keywords: ["sample"], entities: undefined, text: "資料".repeat(1000) }];
		let called = false;
		const result = await answerFromReviewedSources("sample", "", facts, async () => { called = true; return ""; });
		assert.equal(called, false);
		assert.equal(result.issue, "context");
		assert.strictEqual(result.facts[0], facts[0]);
	});
});

describe("source-backed failure recovery", () => {
	it("recovers from context, timeout, GPU loss and runtime failures", async () => {
		for (const [error, issue] of [["ContextWindowSizeExceededError: prompt tokens exceed context window", "context"], ["Guide timed out", "timeout"], ["DeviceLostError: GPU device lost", "device"], ["Unexpected model failure", "runtime"]] as const) {
			const result = await answerFromReviewedSources(recentQuestion, "", knowledge, async () => { throw new Error(error); });
			assert.equal(result.issue, issue);
			assert.equal(result.facts[0].id, "resume-example-recent");
			assert.ok(result.facts.every((item) => knowledge.includes(item)));
		}
	});
	it("keeps the same reviewed corpus usable after the model becomes unavailable", async () => {
		const first = await answerFromReviewedSources(recentQuestion, "", knowledge, null);
		const next = await answerFromReviewedSources("Explain Example Guide Agent in detail including technologies", first.nextTopic, knowledge, null);
		assert.equal(first.facts[0].id, "resume-example-recent");
		assert.ok(next.facts.some((item) => item.id === "resume-example-guide-tools"));
		assert.ok(next.facts.every((item) => item.entities?.includes("Example Guide Agent")));
	});
	it("recovers from malformed output and un-retrieved IDs without rendering model prose", async () => {
		for (const raw of ["invalid JSON", '{"factIds":["not-reviewed"],"answer":"Made-up claim"}']) {
			const result = await answerFromReviewedSources(recentQuestion, "", knowledge, async () => raw);
			assert.equal(result.issue, "format");
			assert.equal(result.facts[0].id, "resume-example-recent");
			assert.ok(!JSON.stringify(result).includes("Made-up"));
		}
	});
	it("honours intentional unknown answers and excluded personal details", async () => {
		const unknown = await answerFromReviewedSources(recentQuestion, "", knowledge, async () => '{"factIds":[]}');
		assert.deepEqual(unknown.facts, []);
		assert.equal(unknown.issue, null);
		const excluded = await answerFromReviewedSources("What is his phone number?", recentQuestion, knowledge, null);
		assert.deepEqual(excluded.facts, []);
	});
	it("labels local search honestly without echoing raw errors or prompts", () => {
		const issue = classifyGuideIssue(new Error("DeviceLostError: GPU device lost; sensitive-debug-text"));
		const notice = recoveryNotice(issue, "search");
		assert.match(notice, /local résumé search/);
		assert.match(notice, /ai load/);
		assert.ok(!notice.includes("sensitive-debug-text"));
		assert.match(recoveryNotice("context", "model"), /model is still loaded/);
		assert.equal(recoveryNotice(null, "model"), "");
	});
});
