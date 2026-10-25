import { asksForExcludedDetails, completeDetailedSelection, createSelectionSchema, parseFactSelection, relevantKnowledge, resolveQuestionTopic, selectionPrompt, type KnowledgeFact } from "./portfolio-ai";

// A conservative UTF-8 bound also covers punctuation/technical names that
// tokenize more densely than ordinary prose. Leave room in the 4k-token model
// for chat-template tokens and its short structured response.
export const MAX_PROMPT_BYTES = 3200;
export type GuideIssue = "context" | "timeout" | "device" | "format" | "runtime";
export type GuideMode = "model" | "search";
export type SelectionRequest = {
	messages: { role: "system" | "user"; content: string }[];
	response_format: { type: "json_object"; schema: string };
	temperature: number;
	max_tokens: number;
};
export type GuideAnswer = { facts: KnowledgeFact[]; issue: GuideIssue | null; nextTopic: string };

export function classifyGuideIssue(error: unknown): GuideIssue {
	const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
	if (/context.?window|prompt tokens|context limit|input.*too (?:long|large)/i.test(message)) return "context";
	if (/timed?\s*out|timeout/i.test(message)) return "timeout";
	if (/device.?lost|webgpu|graphics|gpu|out.of.memory|worker.*(?:stopped|unavailable)/i.test(message)) return "device";
	if (/grammar|json|response.?format|source selection/i.test(message)) return "format";
	return "runtime";
}

export function buildSelectionRequest(question: string, facts: KnowledgeFact[], maximum = MAX_PROMPT_BYTES): { request: SelectionRequest; candidates: KnowledgeFact[] } | null {
	const candidates = facts.slice(0, 6);
	while (candidates.length) {
		const request: SelectionRequest = {
			messages: [
				{ role: "system", content: `${selectionPrompt}\nApproved sections: ${JSON.stringify(candidates.map(({ id, title, text }) => ({ id, title, text })))}` },
				{ role: "user", content: question.slice(0, 1000) },
			],
			response_format: { type: "json_object", schema: JSON.stringify(createSelectionSchema(candidates)) },
			temperature: 0,
			max_tokens: 192,
		};
		if (new TextEncoder().encode(JSON.stringify(request)).length <= maximum) return { request, candidates };
		candidates.pop();
	}
	return null;
}

function validSelection(raw: string): boolean {
	try {
		const value: unknown = JSON.parse(raw);
		return !!value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>).factIds);
	} catch { return false; }
}

/** Fault recovery uses only the same reviewed local sources, never another model. */
export async function answerFromReviewedSources(
	question: string,
	previous: string,
	all: KnowledgeFact[],
	select: ((request: SelectionRequest) => Promise<string>) | null,
): Promise<GuideAnswer> {
	if (asksForExcludedDetails(question)) return { facts: [], issue: null, nextTopic: previous };
	const topic = resolveQuestionTopic(question, previous, all);
	const nextTopic = topic.followUp ? previous : question;
	const candidates = relevantKnowledge(topic.question, all);
	if (!candidates.length) return { facts: [], issue: null, nextTopic };
	const local = (issue: GuideIssue | null): GuideAnswer => ({
		facts: completeDetailedSelection(topic.question, candidates.slice(0, 3), candidates, all), issue, nextTopic,
	});
	if (!select) return local(null);
	const built = buildSelectionRequest(topic.question, candidates);
	if (!built) return local("context");
	try {
		const raw = await select(built.request);
		if (!validSelection(raw)) return local("format");
		const facts = parseFactSelection(raw, built.candidates);
		// A deliberate empty selection means unknown. Invalid/un-retrieved IDs
		// instead recover to reviewed matches without displaying the model's text.
		if (!facts.length && (JSON.parse(raw).factIds as unknown[]).length) return local("format");
		return { facts: completeDetailedSelection(topic.question, facts, built.candidates, all), issue: null, nextTopic };
	} catch (error) {
		return local(classifyGuideIssue(error));
	}
}

export function recoveryNotice(issue: GuideIssue | null, mode: GuideMode): string {
	if (!issue && mode === "model") return "";
	const reason = issue ? {
		context: "The model reached a local context limit.",
		timeout: "The local model took too long to respond.",
		device: "The browser’s graphics model became unavailable.",
		format: "The model returned an invalid source selection.",
		runtime: "The local model couldn’t finish this answer.",
	}[issue] : "The local model is unavailable.";
	return `${reason} Showing reviewed sections from local résumé search instead. ${mode === "model" ? "The model is still loaded; you can keep asking." : "You can keep searching, or use ai load to retry the model."} No cloud model was used.`;
}
