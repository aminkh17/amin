/**
 * Deliberately small, public-only projection of resume-metadata/my-resume.yaml.
 * Reviewed against its resume-tailor skill on 2026-10-24. This is not the raw
 * resume: keep employers, clients, project names, internal details and metrics out.
 * Update the canonical resume first, then deliberately review this projection.
 */
export const profile = {
	name: "Amin Khodabandeh",
	location: "Melbourne, Australia",
	summary: "I build cloud applications, enterprise integrations and applied AI systems, and lead engineering teams.",
	email: "hello@kuara.dev",
	links: [
		{ id: "repository", label: "Source repository on GitHub", href: "https://github.com/aminkh17/amin" },
		{ id: "github", label: "GitHub profile", href: "https://github.com/aminkh17" },
		{ id: "linkedin", label: "LinkedIn profile", href: "https://www.linkedin.com/in/aminxodai" },
		{ id: "instagram", label: "Photography on Instagram", href: "https://www.instagram.com/acodeband" },
	],
	experience: [
		{
			id: "career-consulting",
			period: "2022–present",
			role: "Engineering Manager / Senior Consultant",
			organization: "Technology consultancy",
			description: "Architecture, cloud applications, integrations and engineering team leadership.",
		},
		{
			id: "career-enterprise",
			period: "2018–2022",
			role: "Manager, Application Development",
			organization: "Global enterprise",
			description: "Application and QA teams, integration platforms and production support.",
		},
		{
			id: "career-software",
			period: "2014–2018",
			role: "Lead Software Engineer",
			organization: "Software company",
			description: "Application architecture, data processing and cloud migration.",
		},
	],
	work: [
		{
			id: "work-ai",
			title: "Applied AI",
			description: "Retrieval, agent workflows and evaluation.",
		},
		{
			id: "work-platforms",
			title: "Cloud & platforms",
			description: "Cloud applications, delivery pipelines and modernization.",
		},
		{
			id: "work-teams",
			title: "Engineering teams",
			description: "Technical direction, mentoring and day-to-day delivery.",
		},
	],
	skills: ["C# / .NET", "Python / Java", "TypeScript / React", "Azure / AWS", "SQL / APIs", "Docker / Kubernetes"],
	education: "BSc, Computer Software Engineering",
	privacy: "Names are omitted from this overview. The optional AI has a fuller résumé background.",
} as const;

export type PublicFact = { id: string; text: string; anchor: string; label: string };

// Ordinary commands use only the visible overview, not the opt-in background.
export const publicFacts: PublicFact[] = [
	{ id: "about", text: `${profile.name}. ${profile.location}. ${profile.summary}`, anchor: "about", label: "About" },
	...profile.experience.map((entry) => ({
		id: entry.id,
		text: `${entry.period}: ${entry.role}, ${entry.organization}. ${entry.description}`,
		anchor: "experience",
		label: "Experience",
	})),
	...profile.work.map((entry) => ({ id: entry.id, text: `${entry.title}: ${entry.description}`, anchor: "work", label: "Work" })),
	{ id: "skills", text: profile.skills.join(" · "), anchor: "skills", label: "Tools" },
	{ id: "education", text: profile.education, anchor: "skills", label: "Education" },
	{ id: "contact", text: `Contact: ${profile.email}`, anchor: "contact", label: "Contact" },
	{ id: "privacy", text: profile.privacy, anchor: "privacy", label: "Privacy" },
];
