import { publicFacts, type PublicFact } from "../data/amin";
import type { KnowledgeFact } from "../lib/portfolio-ai";
import type { LocalPortfolioGuide } from "./portfolio-ai";

function setupPortfolio() {
	const panel = document.querySelector<HTMLElement>("#command-panel");
	const output = document.querySelector<HTMLElement>("#command-output");
	const form = document.querySelector<HTMLFormElement>("#command-form");
	const input = document.querySelector<HTMLInputElement>("#command-input");
	const themeButton = document.querySelector<HTMLButtonElement>("#theme-switch");
	const printButton = document.querySelector<HTMLButtonElement>("#print-profile");
	const dialog = document.querySelector<HTMLDialogElement>("#ai-consent");
	const confirm = document.querySelector<HTMLButtonElement>("#confirm-ai");
	const status = document.querySelector<HTMLElement>("#ai-status");
	if (!panel || !output || !form || !input || !themeButton || !dialog || !confirm || !status) return;

	let guide: LocalPortfolioGuide | null = null;
	let state: "off" | "loading" | "ready" | "answering" | "forgetting" = "off";
	let version = 0;
	let pending: HTMLElement | null = null;
	const history: string[] = [];
	let historyIndex = 0;
	let draft = "";

	function updateTheme() {
		const isQBasic = document.documentElement.dataset.portfolioTheme === "qbasic";
		themeButton!.textContent = isQBasic ? "Terminal ↔" : "QBasic ↔";
		themeButton!.setAttribute("aria-label", `Switch to ${isQBasic ? "terminal" : "QBasic"} theme`);
		document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isQBasic ? "#000082" : "#171a19");
	}

	function setTheme(theme?: string) {
		const selected = theme || (document.documentElement.dataset.portfolioTheme === "qbasic" ? "terminal" : "qbasic");
		if (selected !== "terminal" && selected !== "qbasic") return;
		document.documentElement.dataset.portfolioTheme = selected;
		try {
			localStorage.setItem("amin-theme", selected);
			sessionStorage.setItem("amin-session-theme", selected);
		} catch { /* Storage may be blocked; the switch still works. */ }
		updateTheme();
	}

	function setState(next: typeof state) {
		state = next;
		status!.textContent = { off: "AI off", loading: "AI loading", ready: guide?.mode === "search" ? "Local résumé search · no model" : "AI ready · on-device", answering: "Reading résumé…", forgetting: "Removing model…" }[next];
	}

	function message(command: string, text: string) {
		const entry = document.createElement("div");
		entry.className = "response-entry";
		const heading = document.createElement("p");
		heading.className = "response-command";
		heading.textContent = `> ${command}`;
		const body = document.createElement("div");
		body.className = "response-body";
		body.textContent = text;
		entry.appendChild(heading);
		entry.appendChild(body);
		output!.hidden = false;
		output!.appendChild(entry);
		while (output!.children.length > 8) output!.firstElementChild?.remove();
		output!.scrollTop = output!.scrollHeight;
		return body;
	}

	function renderFacts(body: HTMLElement, facts: PublicFact[]) {
		body.replaceChildren();
		if (!facts.length) {
			body.textContent = "That detail isn’t in this overview. The optional AI has a more detailed résumé background.";
			return;
		}
		const list = document.createElement("ul");
		list.className = "fact-answer";
		for (const fact of facts) {
			const item = document.createElement("li");
			const text = document.createElement("span");
			text.textContent = fact.text;
			item.appendChild(text);
			list.appendChild(item);
		}
		body.appendChild(list);
	}

	function renderKnowledge(body: HTMLElement, facts: KnowledgeFact[], notice = "") {
		body.replaceChildren();
		if (notice) {
			const note = document.createElement("p");
			note.className = "guide-notice";
			note.textContent = notice;
			body.appendChild(note);
		}
		if (!facts.length) {
			const text = document.createElement("p");
			text.textContent = "I don’t have that detail in the résumé information available here.";
			body.appendChild(text);
			return;
		}
		output!.classList.add("has-background");
		const list = document.createElement("ul");
		list.className = "fact-answer background-answer";
		for (const fact of facts) {
			const item = document.createElement("li");
			const title = document.createElement("strong");
			title.className = "answer-title";
			title.textContent = fact.title;
			const text = document.createElement("p");
			text.textContent = fact.text;
			item.appendChild(title);
			item.appendChild(text);
			list.appendChild(item);
		}
		body.appendChild(list);
	}

	function stopGuide() {
		version++;
		guide?.destroy();
		guide = null;
		if (pending) pending.textContent = "Stopped. The model has been unloaded.";
		pending = null;
		setState("off");
	}

	function requestGuide() {
		if (state === "ready" && guide?.mode === "search") {
			if (!dialog!.open) dialog!.showModal();
			return;
		}
		if (state !== "off") {
			message("ai load", state === "ready" ? "Already loaded. Ask a question with: ask What work do you do?" : "The local guide is busy. Use ai unload to stop it.");
			return;
		}
		if (!navigator.gpu) {
			message("ai load", "This browser doesn’t offer WebGPU for the local guide. Everything in the portfolio is still readable above; help, experience and work also work without AI.");
			return;
		}
		if (!dialog!.open) dialog!.showModal();
	}

	async function loadGuide() {
		dialog!.close();
		const previousSearch = state === "ready" && guide?.mode === "search" ? guide : null;
		if (state !== "off" && !previousSearch) return;
		if (previousSearch) guide = null;
		const current = ++version;
		setState("loading");
		const body = message("ai load", "Preparing the local guide… Use ai unload to cancel.");
		pending = body;
		let replacement: LocalPortfolioGuide | null = null;
		try {
			const { LocalPortfolioGuide } = await import("./portfolio-ai");
			if (version !== current) { previousSearch?.destroy(); return; }
			const local = new LocalPortfolioGuide();
			replacement = local;
			guide = local;
			await local.load((progress) => {
				if (version === current) body.textContent = `Loading on this device… ${Math.round(progress * 100)}%. Use ai unload to cancel.`;
			});
			if (version !== current) { previousSearch?.destroy(); return; }
			previousSearch?.destroy();
			pending = null;
			setState("ready");
			body.textContent = "Ready. Ask about the full professional résumé: hidden roles, projects, skills, strengths, achievements, education, certifications or work eligibility. Personal phone and email are excluded; statements are as recorded in the source.";
		} catch {
			if (version !== current) { previousSearch?.destroy(); return; }
			replacement?.destroy();
			if (previousSearch) {
				guide = previousSearch;
				pending = null;
				setState("ready");
				body.textContent = "The model couldn’t reload, but local résumé search is still available. You can keep asking without the model. No cloud model was used.";
			} else {
				stopGuide();
				body.textContent = "The local model couldn’t load on this device. It may need more graphics memory, storage, a compatible browser or a working connection. No question was sent to a cloud model. You can still read everything above.";
			}
		}
	}

	async function ask(question: string, command: string) {
		if (!question) {
			message(command, "Try: ask What experience do you have with AI?");
			return;
		}
		if (state !== "ready" || !guide) {
			message(command, state === "off" ? "The optional AI is off. Type ai load to review its download before enabling the detailed résumé guide. The short overview is already above." : "The local guide is busy. Please wait, or use ai unload to stop it.");
			return;
		}
		const current = ++version;
		const body = message(command, "Reading the relevant résumé background…");
		pending = body;
		setState("answering");
		try {
			const facts = await guide.answer(question);
			if (version !== current) return;
			renderKnowledge(body, facts, guide.notice);
			pending = null;
			setState("ready");
		} catch {
			if (version !== current) return;
			pending = null;
			setState("ready");
			body.textContent = "The guide couldn’t display this answer, but it is still available. Try a shorter question or ask about recent projects. No cloud model was used.";
		}
	}

	async function run(raw: string) {
		const command = raw.trim().slice(0, 500);
		if (!command) return;
		const normalized = command.toLowerCase().replace(/\s+/g, " ");
		if (normalized === "help") {
			message(command, "about · experience · work · skills · contact\nresume — the short overview above\nprint — print or save this page\ntheme terminal / theme qbasic — change the interface\nai load — review and enable the optional local model\nask <question> — explore the detailed résumé background\nai unload / stop — stop and release model memory\nai forget — unload and remove this model’s cached files\nclear — clear these responses, not the profile");
		} else if (["about", "whoami", "experience", "work", "projects", "skills", "contact"].includes(normalized)) {
			const facts = publicFacts.filter((fact) => {
				if (normalized === "experience") return fact.anchor === "experience";
				if (normalized === "work" || normalized === "projects") return fact.anchor === "work";
				return fact.id === (normalized === "whoami" ? "about" : normalized);
			});
			renderFacts(message(command, ""), facts);
		} else if (normalized === "resume" || normalized === "résumé") {
			message(command, "This page is a short anonymous overview. The optional AI can explain the fuller résumé background, including named engagements. Use print to print or save this overview.");
		} else if (normalized === "print") {
			window.print();
		} else if (normalized === "clear") {
			output!.replaceChildren();
			output!.classList.remove("has-background");
			output!.hidden = true;
		} else if (normalized === "theme" || normalized === "theme terminal" || normalized === "theme qbasic") {
			setTheme(normalized.split(" ")[1]);
		} else if (normalized === "ai load") {
			requestGuide();
		} else if (normalized === "ai unload" || normalized === "stop") {
			stopGuide();
			message(command, "Local guide off. Model memory released; cached files stay in this browser until ai forget.");
		} else if (normalized === "ai forget") {
			if (state === "forgetting") return;
			stopGuide();
			const current = version;
			setState("forgetting");
			const body = message(command, "Removing cached model files…");
			try {
				const { forgetModel } = await import("./portfolio-ai");
				await forgetModel();
				body.textContent = "This model’s cached files have been removed. Other site storage is unchanged.";
			} catch {
				body.textContent = "The browser couldn’t remove the model cache. You can remove it through this site’s browser storage settings.";
			} finally {
				if (version === current) setState("off");
			}
		} else if (normalized === "ai status") {
			message(command, status!.textContent || "AI off");
		} else if (/^ask(?:\s|$)/i.test(command)) {
			await ask(command.replace(/^ask\s*/i, ""), command);
		} else if (command.includes(" ") || command.endsWith("?")) {
			await ask(command, command);
		} else {
			message(command, "Not a command I know. Type help, or ask a question once the optional local guide is loaded.");
		}
	}

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const command = input.value.trim();
		if (!command) return;
		history.push(command);
		if (history.length > 30) history.shift();
		historyIndex = history.length;
		draft = "";
		input.value = "";
		void run(command);
	});
	input.addEventListener("keydown", (event) => {
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
		if (!history.length) return;
		event.preventDefault();
		if (historyIndex === history.length) draft = input.value;
		historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === "ArrowUp" ? -1 : 1)));
		input.value = historyIndex === history.length ? draft : history[historyIndex];
	});
	themeButton.addEventListener("click", () => setTheme());
	printButton?.addEventListener("click", () => window.print());
	confirm.addEventListener("click", () => { void loadGuide(); });
	document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
		button.hidden = false;
		button.addEventListener("click", () => { void run(button.dataset.command || "help"); });
	});
	window.addEventListener("pagehide", stopGuide);
	panel.hidden = false;
	themeButton.hidden = false;
	if (printButton) printButton.hidden = false;
	updateTheme();
}

setupPortfolio();
