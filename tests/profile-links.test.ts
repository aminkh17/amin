import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { profile } from "../src/data/amin";

describe("public profile links", () => {
	it("uses the requested repository and personal profile destinations", () => {
		assert.deepEqual(profile.links.map(({ id, href }) => ({ id, href })), [
			{ id: "repository", href: "https://github.com/aminkh17/amin" },
			{ id: "github", href: "https://github.com/aminkh17" },
			{ id: "linkedin", href: "https://www.linkedin.com/in/aminxodai" },
			{ id: "instagram", href: "https://www.instagram.com/acodeband" },
		]);
	});

	it("gives every icon a distinct descriptive label and a clean HTTPS URL", () => {
		assert.equal(new Set(profile.links.map((link) => link.id)).size, profile.links.length);
		assert.equal(new Set(profile.links.map((link) => link.label)).size, profile.links.length);
		for (const link of profile.links) {
			assert.ok(link.label.trim().length > 6);
			const url = new URL(link.href);
			assert.equal(url.protocol, "https:");
			assert.equal(url.username + url.password + url.search + url.hash, "");
		}
		assert.match(profile.links.find((link) => link.id === "instagram")!.label, /photography/i);
	});
});
