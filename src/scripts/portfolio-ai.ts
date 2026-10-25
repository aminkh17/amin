import { WebWorkerMLCEngine, deleteModelAllInfoInCache } from "@mlc-ai/web-llm";
import { CONTEXT_URL, MODEL_ID, knowledgeFromBackground, parseBackgroundDocument, type KnowledgeFact } from "../lib/portfolio-ai";
import { answerFromReviewedSources, recoveryNotice, type GuideIssue, type GuideMode, type SelectionRequest } from "../lib/portfolio-guide";

/** This entire module (and WebLLM) is fetched only after explicit consent. */
export class LocalPortfolioGuide {
	private worker: Worker | null = null;
	private engine: WebWorkerMLCEngine | null = null;
	private reject: ((reason: Error) => void) | null = null;
	private failure: Promise<never> | null = null;
	private closed = false;
	private contextRequest = new AbortController();
	private facts: KnowledgeFact[] = [];
	private lastQuestion = "";
	private lastIssue: GuideIssue | null = null;
	private lastNotice = "";

	get mode(): GuideMode { return this.engine && !this.closed ? "model" : "search"; }
	get notice(): string { return this.lastNotice; }

	async load(onProgress: (progress: number) => void) {
		const gpu = navigator.gpu;
		if (!gpu || !(await gpu.requestAdapter())) throw new Error("WebGPU is unavailable");
		if (this.closed) throw new Error("Guide stopped");
		const response = await this.withTimeout(fetch(CONTEXT_URL, { signal: this.contextRequest.signal, cache: "no-store", credentials: "omit" }), 30_000);
		if (!response.ok) throw new Error("Resume background is unavailable");
		const text = await response.text();
		if (text.length > 2_000_000) throw new Error("Resume background is too large");
		this.facts = knowledgeFromBackground(parseBackgroundDocument(JSON.parse(text)));
		if (this.closed) throw new Error("Guide stopped");
		this.failure = new Promise<never>((_, reject) => { this.reject = reject; });
		// A page can unload between tasks. Never leave an unhandled rejection.
		void this.failure.catch(() => {});
		this.worker = new Worker(new URL("./portfolio-ai.worker.ts", import.meta.url), { type: "module" });
		this.worker.addEventListener("error", () => {
			this.lastIssue = "device";
			this.releaseModel(new Error("Browser worker stopped"));
		}, { once: true });
		this.engine = new WebWorkerMLCEngine(this.worker, {
			logLevel: "SILENT",
			initProgressCallback: ({ progress }) => onProgress(Math.max(0, Math.min(1, progress))),
		});
		await this.withTimeout(this.engine.reload(MODEL_ID, { context_window_size: 4096 }), 300_000);
	}

	async answer(question: string) {
		if (this.closed || !this.facts.length) throw new Error("Guide is not loaded");
		const engine = this.engine;
		const select = engine ? async (request: SelectionRequest) => {
			// Each selection is stateless. Do not let earlier questions accumulate
			// GPU conversation state or consume the context window.
			await this.withTimeout(engine.resetChat(true), 5_000);
			const result = await this.withTimeout(engine.chat.completions.create(request), 30_000);
			return result.choices[0]?.message.content || "";
		} : null;
		const answer = await answerFromReviewedSources(question, this.lastQuestion, this.facts, select);
		if (this.closed) throw new Error("Guide stopped");
		this.lastQuestion = answer.nextTopic;
		if (answer.issue) {
			this.lastIssue = answer.issue;
			if (!["context", "format"].includes(answer.issue)) this.releaseModel(new Error("Local model unavailable"));
		} else if (this.mode === "model") this.lastIssue = null;
		this.lastNotice = recoveryNotice(answer.issue || (this.mode === "search" ? this.lastIssue : null), this.mode);
		return answer.facts;
	}

	private releaseModel(reason: Error) {
		this.reject?.(reason);
		this.reject = null;
		this.worker?.terminate();
		this.worker = null;
		this.engine = null;
		this.failure = null;
	}

	private async withTimeout<T>(task: Promise<T>, milliseconds: number): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("Guide timed out")), milliseconds);
		});
		try {
			return await Promise.race([task, timeout, ...(this.failure ? [this.failure] : [])]);
		} finally {
			clearTimeout(timer);
		}
	}

	destroy() {
		if (this.closed) return;
		this.closed = true;
		this.contextRequest.abort();
		this.facts = [];
		this.lastQuestion = "";
		this.releaseModel(new Error("Guide stopped"));
	}
}

export async function forgetModel() {
	// Only this model's browser cache; never touch site/admin/session storage.
	await deleteModelAllInfoInCache(MODEL_ID);
}
