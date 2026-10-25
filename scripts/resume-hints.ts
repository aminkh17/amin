import { readFile } from "node:fs/promises";
import type { BackgroundFact } from "../src/lib/portfolio-ai";

type ResumeHint = Pick<BackgroundFact, "title" | "entities" | "keywords">;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum: number): value is string => typeof value === "string" && !!value.trim() && value.length <= maximum;
const strings = (value: unknown, maximum: number): value is string[] => Array.isArray(value) && value.length <= maximum && value.every((item) => text(item, 100));

/** Metadata only: never accept paragraphs from an old résumé snapshot. */
export function parseResumeHints(value: unknown): ResumeHint[] {
	if (!Array.isArray(value) || value.length > 600) throw new Error("Resume hints must be an array of at most 600 metadata records");
	return value.map((hint: unknown): ResumeHint => {
		if (!record(hint)) throw new Error("Invalid resume hint");
		if (Object.keys(hint).some((key) => !["title", "entities", "keywords"].includes(key))) throw new Error("Resume hints accept only title, entities and keywords");
		if (!text(hint.title, 160) || !strings(hint.keywords, 24) || (hint.entities !== undefined && !strings(hint.entities, 16))) throw new Error("Invalid resume hint metadata");
		return {
			title: hint.title.trim(),
			keywords: [...new Set(hint.keywords.map((item) => item.trim()))],
			...(hint.entities ? { entities: [...new Set(hint.entities.map((item) => item.trim()))] } : {}),
		};
	});
}

export async function loadResumeHints(path: string, { required = false } = {}): Promise<ResumeHint[]> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	return parseResumeHints(JSON.parse(content));
}
