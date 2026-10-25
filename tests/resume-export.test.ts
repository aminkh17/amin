import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportResume } from "../src/lib/resume-export";
import { profile } from "../src/data/amin";
import { knowledgeFromBackground, parseBackgroundDocument, relevantKnowledge } from "../src/lib/portfolio-ai";

const fixture = () => ({
	personal: { name: profile.name, title: "Technical lead", location: "Example City", work_rights: "Recorded permanent resident", phone: "+1 555 014 8999", email: "private-contact@example.invalid", linkedin: "linkedin.com/in/example-person" },
	professional_summary: "[EM] Led a distributed team.\n[PE] Built source-backed software.",
	sectors: ["Travel", "Robotics"],
	skills: { core_technologies: ["Example language", "Example database"], specialized: ["A unique specialty retained from the source"] },
	work_experience: {
		older: {
			company: "Older Example Studio", role: "Engineering lead", period: "2008 - 2017", location: "Example City", type: "Startup", hide: "yes", onlytitle: true,
			highlights: ["The source reports 17 fictional agencies and $42,000 in sample bookings.", "Built a uniquely identified reservation engine."],
			client: { travel: { name: "Example Travel Platform", client: "Example Holidays (Travel)", role: "Technical lead", period: "2016 - 2017", description: "[EM][PE] Designed a reservation platform and mentored engineers.", technologies: ["Example language", "Example database"] } },
		},
	},
	education: [{ degree: "Example degree", institution: "Example University", year: 2005 }],
	certifications: ["Example Certified Architect", "Example leadership training"],
	strengths: ["Unusual problem-solving perspective", "Empathetic mentor"],
	additional_professional_section: { contribution: "A future professional section is not silently omitted 🚀" },
});
const generate = (raw: unknown) => exportResume(raw, { publicEmail: "hello@kuara.dev", reviewedAt: "2026-10-24" });

describe("complete professional-source export", () => {
	it("covers every source leaf except the two explicitly excluded contact fields", () => {
		const result = generate(fixture());
		assert.equal(result.coverage.sourceLeaves - result.coverage.exportedLeaves, 2);
		assert.equal(result.coverage.verifiedValues, result.coverage.exportedLeaves);
		assert.deepEqual(result.coverage.redacted, ["personal.phone", "personal.email"]);
		assert.deepEqual(result.coverage.missing, []);
		assert.ok(result.coverage.fields["additional_professional_section.contribution"]);
		assert.ok(JSON.stringify(result.document).includes("🚀"));
	});
	it("includes hidden/only-title roles, full contributions, outcomes, skills and projects", () => {
		const result = generate(fixture());
		const text = result.document.facts.map((fact) => fact.text).join("\n");
		assert.deepEqual(result.coverage.hiddenRecords, ["work_experience.older"]);
		for (const value of ["Older Example Studio", "Example Travel Platform", "17 fictional agencies", "$42,000", "unique specialty", "Unusual problem-solving perspective"]) assert.ok(text.includes(value), value);
		assert.match(text, /The résumé reports:/);
		assert.ok(result.coverage.fields["work_experience.older.hide"]);
		assert.ok(result.coverage.fields["work_experience.older.onlytitle"]);
	});
	it("preserves the relationship between client/project and parent employer", () => {
		const result = generate(fixture());
		const project = result.document.facts.find((fact) => fact.title.includes("Example Travel Platform") && fact.text.includes("reservation platform"))!;
		assert.match(project.text, /Older Example Studio/);
		assert.match(project.text, /Example Holidays/);
	});
	it("keeps degrees, institutions and years together and separates summary personas", () => {
		const result = generate(fixture());
		const degree = result.document.facts.find((fact) => fact.title.includes("Example degree"))!;
		assert.match(degree.text, /Example University/);
		assert.match(degree.text, /2005/);
		assert.ok(result.document.facts.some((fact) => fact.title.includes("management framing")));
		assert.ok(result.document.facts.some((fact) => fact.title.includes("technical framing")));
		assert.ok(!JSON.stringify(result.document).includes("[EM]"));
	});
	it("excludes private contacts everywhere and supplies the approved public email", () => {
		const text = JSON.stringify(generate(fixture()).document);
		assert.ok(!text.includes("private-contact@example.invalid"));
		assert.ok(!text.includes("555 014 8999"));
		assert.ok(text.includes("hello@kuara.dev"));
		assert.ok(text.includes("linkedin.com/in/example-person"));
	});
	it("fails closed if personal values appear elsewhere or unreviewed sensitive fields are added", () => {
		const duplicate = fixture();
		duplicate.professional_summary += " Contact private-contact@example.invalid";
		assert.throws(() => generate(duplicate), /Private email/);
		const personal = fixture();
		Object.assign(personal.personal, { passport: "not-public" });
		assert.throws(() => generate(personal), /Unreviewed personal fields/);
		assert.throws(() => generate({ ...fixture(), secrets: { key: "not-public" } }), /Sensitive root section/);
	});
	it("splits long values without losing any source text or violating context-record limits", () => {
		const raw = fixture();
		raw.work_experience.older.highlights.push("Long contribution " + "word ".repeat(1800));
		const result = generate(raw);
		assert.equal(result.coverage.verifiedValues, result.coverage.exportedLeaves);
		assert.ok(result.document.facts.every((fact) => fact.text.length <= 2400));
		assert.equal(new Set(result.document.facts.map((fact) => fact.id)).size, result.document.facts.length);
		assert.doesNotThrow(() => parseBackgroundDocument(result.document));
	});
	it("supports work eligibility, strengths and credentials from generated facts", () => {
		const knowledge = knowledgeFromBackground(generate(fixture()).document);
		assert.match(relevantKnowledge("What are his work rights?", knowledge)[0].text, /permanent resident/);
		assert.match(relevantKnowledge("What are his strengths?", knowledge)[0].text, /Empathetic mentor/);
		assert.match(relevantKnowledge("what certification he has", knowledge)[0].text, /Example Certified Architect/);
		assert.match(relevantKnowledge("Which hidden roles are available?", knowledge)[0].text, /Older Example Studio/);
	});
	it("keeps credential lists/details free of unsolicited status and source commentary", () => {
		const knowledge = knowledgeFromBackground(generate(fixture()).document);
		for (const question of ["what certificates he have?", "What certifications does he have?", "Which architect certificate does he hold?"]) {
			const matches = relevantKnowledge(question, knowledge);
			assert.ok(matches.length > 0, question);
			for (const fact of matches) assert.ok(!/does not provide|not verified|not recorded|expiry|renewal|should not be counted|The résumé lists/i.test(fact.text), fact.text);
		}
		const list = relevantKnowledge("what certificates he have?", knowledge)[0];
		assert.equal(list.text, "• Example Certified Architect\n• Example leadership training");
	});
	it("answers explicit validity/date questions separately without implying status", () => {
		const knowledge = knowledgeFromBackground(generate(fixture()).document);
		for (const question of ["Are his certifications current?", "What are his certificate expiry dates?", "When were his certifications awarded?"]) {
			const matches = relevantKnowledge(question, knowledge);
			assert.equal(matches.length, 1, question);
			assert.ok(matches[0].keywords.includes("topic:credential-status"));
			assert.match(matches[0].text, /not recorded|not provided/);
			assert.ok(!matches[0].text.includes("Example Certified Architect"));
		}
	});
	it("has deterministic IDs across repeat exports", () => {
		assert.deepEqual(generate(fixture()).document, generate(fixture()).document);
	});
	it("does not leak sibling-project aliases through a shared client", () => {
		const raw = fixture();
		Object.assign(raw.work_experience.older.client, {
			other: { name: "Other Example Project", client: "Example Holidays (Travel)", role: "Developer", period: "2018", description: "A different project for the same client." },
		});
		const result = exportResume(raw, { publicEmail: "hello@kuara.dev", reviewedAt: "2026-10-24", hints: [
			{ title: "Example Travel Platform", entities: ["Example Travel Platform", "Example Holidays"], keywords: ["sector:travel"] },
			{ title: "Other Example Project", entities: ["Other Example Project", "Example Holidays"], keywords: ["sector:travel"] },
		] });
		const other = result.document.facts.filter((fact) => fact.title.startsWith("Other Example Project"));
		assert.ok(other.length > 0);
		assert.ok(other.every((fact) => !fact.entities?.includes("Example Travel Platform")));
	});
	it("does not substitute a technology list for a specific recorded performance claim", () => {
		const raw = fixture();
		raw.work_experience.older.highlights.push("Optimized SQL execution time by 73% in this fictional fixture.");
		const result = exportResume(raw, { publicEmail: "hello@kuara.dev", reviewedAt: "2026-10-24", hints: [
			{ title: "Older Example Studio", entities: ["Older Example Studio"], keywords: ["SQL Server", "performance"] },
		] });
		const matches = relevantKnowledge("How did SQL execution time improve at Older Example Studio?", knowledgeFromBackground(result.document));
		assert.ok(matches.length > 0);
		assert.ok(matches.every((fact) => fact.text.includes("73%")));
	});
});
