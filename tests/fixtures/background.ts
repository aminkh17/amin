import { profile } from "../../src/data/amin";
import { knowledgeFromBackground, type BackgroundDocument, type BackgroundFact } from "../../src/lib/portfolio-ai";

// Fictional retrieval corpus. Never import the owner's generated résumé or
// legacy background into tests or tracked examples.
const fact = (id: string, title: string, text: string, keywords: string[], entities?: string[]): BackgroundFact => ({ id: `resume-example-${id}`, title, text, keywords, ...(entities ? { entities } : {}) });
const guide = ["Example Guide Agent", "EGA", "Example Studio"];
const documents = ["Example Document Bot", "EDB", "Example Studio"];

export const background: BackgroundDocument = {
	version: 1,
	reviewedAt: "2026-10-24",
	subject: profile.name,
	facts: [
		fact("guide", "Example Guide Agent — Responsibilities and architecture", "Designed a retrieval agent for Example Studio, with reviewed source selection, evaluation and deployment controls.", ["AI", "retrieval", "architecture", "responsibilities", "evaluation", "deployment", "sector:professional services"], guide),
		fact("guide-tools", "Example Guide Agent — Technologies", "Example Guide Agent used C#, .NET, a vector index and a container deployment pipeline.", ["technologies", "tools", "C#", ".NET", "containers", "deployment", "sector:professional services"], guide),
		fact("document", "Example Document Bot — Responsibilities and architecture", "Built Example Document Bot for Example Studio, using retrieval-augmented generation over a fictional document collection.", ["AI", "LLM", "retrieval", "architecture", "responsibilities", "sector:professional services"], documents),
		fact("document-tools", "Example Document Bot — Technologies", "Example Document Bot used Python, a vector store and automated retrieval evaluation.", ["Python", "technologies", "tools", "retrieval", "evaluation", "sector:professional services"], documents),
		fact("travel", "Example Booking Platform — Travel work", "Built reservation and booking software for Example Holidays during 2015–2017. The résumé reports 23 bookings in this fictional fixture.", ["travel", "tourism", "booking", "reservations", "engagement", "responsibilities", "sector:travel", "sector:tourism"], ["Example Booking Platform", "EBP", "Example Holidays"]),
		fact("government", "Example Transport Connector — Integration", "Designed a Salesforce integration and API workflow for a fictional public transport regulator.", ["Salesforce", "integration", "API", "government", "public sector", "sector:government", "sector:public sector"], ["Example Transport Connector", "ETC"]),
		fact("teaching", "Example Training Center — Instructor", "Taught software engineering classes at Example Training Center during 2018–2020.", ["teaching", "training", "instructor", "education", "sector:education", "sector:training"], ["Example Training Center"]),
		fact("finance", "Example Pension Portal — Financial services", "Built a member portal for a fictional superannuation provider.", ["finance", "financial services", "superannuation", "sector:finance", "sector:financial services", "sector:superannuation"], ["Example Pension Portal"]),
		fact("degree", "Example Software Degree", "Example Software Degree, Example University, 2015.", ["education", "degree", "qualification"], ["Example University"]),
		fact("recent", "Recent projects and responsibilities", "Example Guide Agent (2025); Example Document Bot (2024); Example Transport Connector (2023).", ["recent projects", "latest projects", "current work", "newest engagements", "recent", "projects", "responsibilities"]),
		fact("industries", "Industry and sector experience", "Travel; professional services; government; education; financial services.", ["industry", "industries", "sector", "sectors", "industry overview", "topic:industry-overview"]),
		fact("employers", "Recorded employer timeline", "Example Studio — Technical Lead (2021–present); Example Training Center — Instructor (2018–2020).", ["employers", "clients", "names", "companies", "career", "employment", "timeline", "history"]),
		fact("hidden", "Roles marked hidden in short documents", "Example Training Center — Instructor (2018–2020).", ["hidden", "hide", "roles", "employers", "history", "topic:hidden-roles-overview"]),
		fact("strengths", "Recorded strengths", "Patient mentoring; clear technical communication.", ["strengths", "qualities", "topic:strengths"]),
		fact("rights", "Work eligibility", "Example recorded work eligibility.", ["work rights", "eligibility", "visa", "topic:work-eligibility"]),
		fact("credentials", "Certifications and professional development", "• Example Cloud Architect Certificate\n• Example Leadership Program", ["certification", "certificates", "credentials", "training", "topic:credentials", "topic:credential-overview"]),
		fact("credential-architect", "Credential or training record", "Example Cloud Architect Certificate", ["cloud", "architect", "certificate", "topic:credentials", "topic:credential-detail"]),
		fact("credential-leadership", "Credential or training record", "Example Leadership Program", ["leadership", "program", "topic:credentials", "topic:credential-detail"]),
		fact("credential-status", "Credential status and dates", "That information is not recorded in the résumé.", ["current", "validity", "status", "dates", "certifications", "credentials", "topic:credentials", "topic:credential-status"]),
	],
};

export const knowledge = knowledgeFromBackground(background);
export const source = (id: string) => knowledge.find((item) => item.id === `resume-example-${id}`)!;
