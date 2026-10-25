import { createHash } from "node:crypto";
import type { BackgroundDocument, BackgroundFact } from "./portfolio-ai";

type Node = Record<string, unknown>;
type Hint = Pick<BackgroundFact, "title" | "entities" | "keywords">;
export type ExportResult = {
	document: BackgroundDocument;
	coverage: { sourceLeaves: number; exportedLeaves: number; verifiedValues: number; redacted: string[]; hiddenRecords: string[]; missing: string[]; fields: Record<string, string[]> };
};
const object = (value: unknown): value is Node => !!value && typeof value === "object" && !Array.isArray(value);
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const clean = (value: unknown) => String(value ?? "").replace(/\[(?:EM|PE)\]/g, "").replace(/\s+/g, " ").trim();
const baseName = (value: unknown) => object(value) || Array.isArray(value) ? "" : clean(value).replace(/\s*\([^)]*\)\s*/g, " ").trim();
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

function leaves(value: unknown, path = ""): string[] {
	if (Array.isArray(value)) return value.flatMap((child, index) => leaves(child, `${path}.${index}`));
	if (object(value)) return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
	return [path];
}

function leafValues(value: unknown, path = ""): [string, unknown][] {
	if (Array.isArray(value)) return value.flatMap((child, index) => leafValues(child, `${path}.${index}`));
	if (object(value)) return Object.entries(value).flatMap(([key, child]) => leafValues(child, path ? `${path}.${key}` : key));
	return [[path, value]];
}

function split(value: string, maximum = 950): string[] {
	const words = value.split(/\s+/);
	const chunks: string[] = [];
	let current = "";
	for (const word of words) {
		if (current && current.length + word.length + 1 > maximum) { chunks.push(current); current = ""; }
		current += `${current ? " " : ""}${word}`;
	}
	if (current) chunks.push(current);
	return chunks;
}

/** Build-time only. Every eligible scalar is covered; hide is presentation, not access. */
export function exportResume(raw: unknown, options: { publicEmail: string; reviewedAt: string; hints?: Hint[] }): ExportResult {
	if (!object(raw) || !object(raw.personal) || !raw.personal.name) throw new Error("Resume needs a personal.name field");
	if (Object.keys(raw).some((key) => /^(?:secrets?|passwords?|api_keys?|tokens?|private_notes?|bank_accounts?|passport)$/i.test(key))) throw new Error("Sensitive root section must not be exported");
	const personal = raw.personal;
	const personalKeys = ["name", "title", "location", "work_rights", "phone", "email", "linkedin"];
	if (Object.keys(personal).some((key) => !personalKeys.includes(key))) throw new Error("Unreviewed personal fields: classify before public export");
	const redacted = ["personal.phone", "personal.email"].filter((path) => leaves(raw).includes(path));
	const facts: BackgroundFact[] = [];
	const fields: Record<string, string[]> = {};
	const hiddenRecords: string[] = [];
	const hints = options.hints || [];
	const employers: string[] = [];
	const hiddenEmployers: string[] = [];
	const projects: { name: string; client: string; role: string; period: string }[] = [];
	const counters = new Map<string, number>();

	function add(path: string, title: string, text: string, keywords: string[] = [], entities: string[] = []): string {
		const sequence = counters.get(path) || 0;
		counters.set(path, sequence + 1);
		const hash = createHash("sha256").update(`${path}:${sequence}`).digest("hex").slice(0, 8);
		const id = `resume-${path.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 50)}-${hash}`;
		facts.push({ id, title: title.slice(0, 160), text, keywords: unique(keywords).slice(0, 24), ...(entities.length ? { entities: unique(entities).slice(0, 16) } : {}) });
		return id;
	}
	function cover(path: string, id: string) { (fields[path] ||= []).push(id); }
	function focused(keywords: string[], value: string): string[] {
		const words = new Set(value.toLowerCase().match(/[a-z0-9#+.]+/g) || []);
		return keywords.filter((keyword) => keyword.includes(":") || (keyword.toLowerCase().match(/[a-z0-9#+.]+/g) || []).some((word) => words.has(word)));
	}
	function emit(path: string, title: string, value: unknown, context = "", keywords: string[] = [], entities: string[] = [], reported = false) {
		const text = clean(value);
		for (const [index, chunk] of (split(text).length ? split(text) : ["Not specified"]).entries()) {
			const id = add(`${path}.part-${index}`, title, `${context ? `${context} ` : ""}${reported ? "The résumé reports: " : ""}${chunk}`, keywords, entities);
			cover(path, id);
		}
	}
	function metadata(record: Node, parentEntities: string[]) {
		const names = [clean(record.name), baseName(record.name), ...(typeof record.name === "string" ? [...record.name.matchAll(/\(([^)]+)\)/g)].map((match) => clean(match[1])) : [])].filter(Boolean);
		const own = [baseName(record.name), baseName(record.client)].filter(Boolean);
		const company = baseName(record.company).toLowerCase();
		const clientName = baseName(record.client).toLowerCase();
		const matches = hints.map((hint) => ({ hint, score: Math.max(0, ...(hint.entities || []).map((entity) => {
			if (names.some((name) => name.toLowerCase() === entity.toLowerCase())) return 1000 + entity.length;
			if (company && company.includes(entity.toLowerCase()) && hint.title.toLowerCase().includes(entity.toLowerCase())) return 500 + entity.length;
			if (clientName === entity.toLowerCase() && hint.title.toLowerCase().includes(entity.toLowerCase())) return entity.length;
			return 0;
		})) }));
		const maximum = Math.max(0, ...matches.map(({ score }) => score));
		const selected = maximum ? matches.filter(({ score }) => score === maximum).map(({ hint }) => hint) : [];
		const entities = unique([clean(record.name), baseName(record.name), baseName(record.client), clean(record.company), ...parentEntities, ...(maximum >= 500 ? selected.flatMap((hint) => hint.entities || []) : [])]);
		const keywords = unique([...selected.flatMap((hint) => hint.keywords).filter((keyword) => !keyword.startsWith("topic:")), ...own]);
		const client = clean(record.client);
		if (/\(government\)/i.test(client)) keywords.push("sector:government", "sector:public sector");
		if (/\(education\)/i.test(client)) keywords.push("sector:education");
		if (/\(travel\)/i.test(client)) keywords.push("sector:travel", "sector:tourism");
		if (/\(superannuation\)/i.test(client)) keywords.push("sector:superannuation", "sector:finance", "sector:financial services");
		if (/\(professional services\)/i.test(client)) keywords.push("sector:professional services", "sector:consulting");
		if (/robotics/i.test(clean(record.name))) keywords.push("sector:robotics");
		if (/professional services/i.test(clean(record.type))) keywords.push("sector:professional services", "sector:consulting");
		if (/instructor|training center/i.test(`${clean(record.role)} ${company}`)) keywords.push("sector:education", "sector:training");
		return { entities, keywords: unique(keywords) };
	}
	function walk(value: unknown, path: string, context = "", title = "", keywords: string[] = [], entities: string[] = []) {
		if (Array.isArray(value)) {
			if (value.every((child) => !object(child) && !Array.isArray(child))) {
				let group: { value: string; index: number }[] = [];
				const flush = () => {
					if (!group.length) return;
					const text = group.map((item) => item.value).join("; ");
					const reported = /highlights|description|professional_summary|strengths/.test(path);
					const id = add(`${path}.items-${group[0].index}`, title, `${context ? `${context} ` : ""}${reported ? "The résumé reports: " : ""}${text}`, unique([label(path.split(".").at(-1)!), ...focused(keywords, text)]), entities);
					for (const item of group) cover(`${path}.${item.index}`, id);
					group = [];
				};
				for (const [index, child] of value.entries()) {
					const text = clean(child);
					if (text.length > 950) { flush(); emit(`${path}.${index}`, title, child, context, keywords, entities, /highlights|strengths/.test(path)); continue; }
					if (group.reduce((size, item) => size + item.value.length + 2, 0) + text.length > 950) flush();
					group.push({ value: text || "Not specified", index });
				}
				flush();
				return;
			}
			for (const [index, child] of value.entries()) walk(child, `${path}.${index}`, context, title, keywords, entities);
			return;
		}
		if (!object(value)) { emit(path, title || label(path.split(".").at(-1)!), value, context, keywords, entities, /highlights|description|professional_summary|strengths/.test(path)); return; }
		const isEducation = !!value.degree && !!value.institution;
		const isRole = (!!(value.company || value.name) && !!(value.role || value.period)) || isEducation;
		if (isRole) {
			const name = clean(value.name || value.company || value.degree);
			const meta = metadata(value, entities);
			const heading = [name, clean(value.role || (isEducation ? value.institution : ""))].filter(Boolean).join(" — ");
			const hidden = value.hide === true || /^(yes|true)$/i.test(String(value.hide));
			const attributes = ["company", "name", "client", "type", "location", "role", "period", "hide", "onlytitle", "degree", "institution", "year"].filter((key) => value[key] !== undefined && !object(value[key]));
			const summary = attributes.map((key) => `${label(key)}: ${clean(value[key])}`).join(". ");
			const id = add(`${path}.record`, heading, `Résumé record. ${context ? `Parent record: ${context} ` : ""}${summary}.`, unique([...(isEducation ? ["education", "degree", "qualification", name] : ["experience", "career", "employment", "employer", "timeline"]), ...(hidden ? ["hidden", "hide", "topic:hidden-role"] : []), ...focused(meta.keywords, summary)]), meta.entities);
			for (const key of attributes) cover(`${path}.${key}`, id);
			if (value.company) {
				const entry = `${clean(value.company)} — ${clean(value.role)} (${clean(value.period)}; ${clean(value.location)})`;
				employers.push(entry);
				if (hidden) hiddenEmployers.push(entry);
			}
			if (value.name && value.role) projects.push({ name: clean(value.name), client: clean(value.client), role: clean(value.role), period: clean(value.period) });
			if (hidden) hiddenRecords.push(path);
			const recordContext = `${context ? `Parent record: ${context} ` : ""}${name}${value.client && !object(value.client) ? ` for ${clean(value.client)}` : ""}${value.role ? `; role: ${clean(value.role)}` : ""}${value.period ? `; period: ${clean(value.period)}` : ""}${value.location ? `; location: ${clean(value.location)}` : ""}.`;
			for (const [key, child] of Object.entries(value)) {
				if (attributes.includes(key)) continue;
				const contribution = /^(?:description|highlights)$/.test(key);
				const fieldKeywords = contribution ? ["responsibilities", "contributions", "achievements", label(key)] : [label(key)];
				const body = Array.isArray(child) ? child.map(clean).join(" ") : typeof child === "string" ? child : "";
				walk(child, `${path}.${key}`, recordContext, `${name} — ${contribution ? "Responsibilities and reported achievements" : label(key)}`, unique([...fieldKeywords, ...focused(meta.keywords, body)]), meta.entities);
			}
			return;
		}
		for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key, context, title ? `${title} — ${label(key)}` : label(key), unique([label(key), ...keywords]), entities);
	}

	for (const [key, value] of Object.entries(personal)) {
		if (key === "phone" || key === "email") continue;
		const topic = key === "work_rights" ? ["eligibility", "work rights", "work authorization", "permanent resident", "visa", "topic:work-eligibility"] : [key, "profile"];
		emit(`personal.${key}`, key === "work_rights" ? "Work eligibility" : `Profile — ${label(key)}`, value, "", topic);
	}
	add("public-contact", "Public contact", options.publicEmail, ["contact", "email", "hello", "public contact"]);
	for (const [key, value] of Object.entries(raw)) {
		if (key === "personal") continue;
		if (key === "professional_summary" && typeof value === "string") {
			for (const line of value.split("\n").filter((line) => line.trim())) {
				const persona = line.includes("[EM]") ? "management" : line.includes("[PE]") ? "technical" : "professional";
				emit(key, `Professional summary — ${persona} framing`, line, "", ["summary", "profile", "professional summary", `persona:${persona}`], [], true);
			}
			continue;
		}
		walk(value, key, "", label(key), [label(key)]);
	}

	const certs = Array.isArray(raw.certifications) ? raw.certifications.map(clean) : [];
	if (certs.length) {
		const status = "That information is not recorded in the résumé.";
		add("credential-overview", "Certifications and professional development", certs.map((cert) => `• ${cert}`).join("\n"), ["certification", "certificates", "credentials", "qualifications", "training", "topic:credentials", "topic:credential-overview"]);
		for (const [index, cert] of certs.entries()) add(`credential-${index}`, "Credential or training record", cert, unique([cert, ...cert.split(/\s+/).filter((word) => word.length > 2), "topic:credentials", "topic:credential-detail"]));
		add("credential-status", "Credential status and dates", status, ["current", "active", "valid", "validity", "status", "expired", "expiry", "expiration", "renewal", "dates", "certifications", "credentials", "topic:credentials", "topic:credential-status"]);
	}
	if (Array.isArray(raw.strengths)) add("strengths-overview", "Recorded strengths", raw.strengths.map(clean).join("; "), ["strengths", "strength", "qualities", "personality", "problem solving", "learning", "topic:strengths"]);
	if (Array.isArray(raw.sectors)) add("sectors-overview", "Industry and sector experience", raw.sectors.map(clean).join("; "), ["industry", "industries", "sector", "sectors", "industry overview", "sector overview", "topic:industry-overview"]);
	for (const [index, chunk] of split(employers.join("; "), 1400).entries()) add(`employers-overview-${index}`, "Recorded employer timeline", chunk, ["employers", "companies", "career", "employment", "timeline", "history", "roles"]);
	for (const [index, chunk] of split(hiddenEmployers.join("; "), 1400).entries()) add(`hidden-roles-overview-${index}`, "Roles marked hidden in short documents", `The source marks these employer entries as hidden for document presentation: ${chunk}. They are still available to this assistant. Periods are copied as recorded and may overlap.`, ["hidden", "hide", "roles", "employers", "history", "topic:hidden-roles-overview"]);
	for (const [index, chunk] of split(projects.map((project) => `${project.name} for ${project.client}; ${project.role}; ${project.period}`).join("; "), 1400).entries()) add(`projects-overview-${index}`, "Clients and projects", chunk, ["clients", "projects", "engagements", "names", "consulting", "history"]);
	const endDate = (period: string) => {
		if (/present|current/i.test(period)) return 999999;
		const year = [...period.matchAll(/\b(?:19|20)\d{2}\b/g)].at(-1)?.[0] || "0";
		const month = [...period.toLowerCase().matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)].at(-1)?.[1];
		return Number(year) * 100 + (month ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month) + 1 : 0);
	};
	const recent = [...projects].sort((a, b) => endDate(b.period) - endDate(a.period)).slice(0, 3);
	if (recent.length) add("recent-projects", "Recent projects and responsibilities", recent.map((project) => `${project.name} for ${project.client} — ${project.role} (${project.period})`).join("; "), ["recent projects", "latest projects", "current work", "newest engagements", "recent", "projects", "responsibilities"]);
	add("source-policy", "About the résumé source", "This assistant includes every professional section of the supplied résumé, including entries marked hide or onlytitle. Those flags control document presentation, not access to the information. Statements and numerical outcomes are résumé-reported, not independently verified here. Recorded employment periods can overlap; do not infer exclusive full-time arrangements or recalculate total experience from them. Only the public contact address is supplied; the personal phone and personal email are excluded.", ["source", "coverage", "hidden", "hide", "timeline", "claims", "reported achievements"]);

	const expected = leaves(raw);
	const missing = expected.filter((path) => !redacted.includes(path) && !fields[path]?.length);
	if (missing.length) throw new Error(`Unexported resume fields: ${missing.join(", ")}`);
	const byId = new Map(facts.map((fact) => [fact.id, fact]));
	let verifiedValues = 0;
	for (const [path, value] of leafValues(raw)) {
		if (redacted.includes(path)) continue;
		const source = [...clean(value).toLowerCase()];
		const presented = (fields[path] || []).map((id) => byId.get(id)!.text).join(" ").toLowerCase();
		// Prefixes and inherited role context may occur between chunks. Verify
		// that the complete cleaned source value still occurs in order, not just
		// that the field name was visited. No private values enter this report.
		let position = 0;
		for (const character of presented) if (character === source[position]) position++;
		if (position !== source.length) throw new Error(`Incomplete source value in public export: ${path}`);
		verifiedValues++;
	}
	const document: BackgroundDocument = { version: 1, reviewedAt: options.reviewedAt, subject: clean(personal.name), facts };
	const serialized = JSON.stringify(document).toLowerCase();
	const privateEmail = clean(personal.email).toLowerCase();
	const privateDigits = clean(personal.phone).replace(/\D/g, "");
	if (privateEmail && privateEmail !== options.publicEmail.toLowerCase() && serialized.includes(privateEmail)) throw new Error("Private email reached the public export");
	if (privateDigits.length >= 7 && serialized.replace(/\D/g, "").includes(privateDigits)) throw new Error("Private phone reached the public export");
	return { document, coverage: { sourceLeaves: expected.length, exportedLeaves: Object.keys(fields).length, verifiedValues, redacted, hiddenRecords, missing, fields } };
}
