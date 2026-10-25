import generated from "../../data/generated/resume-context.json";
import { parseBackgroundDocument } from "../../lib/portfolio-ai";

// Complete professional-source export. Contact redaction and coverage checks
// happen at build time; no private filesystem access occurs in the Worker.
const body = JSON.stringify(parseBackgroundDocument(generated));

export function GET(): Response {
	return new Response(body, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"X-Robots-Tag": "noindex, nofollow, nosnippet",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "no-referrer",
		},
	});
}
