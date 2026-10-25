import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
	const { pathname } = context.url;
	if (pathname === "/amin" || pathname === "/amin/") return context.redirect("/", 308);
	if (pathname === "/_emdash" || pathname.startsWith("/_emdash/")) {
		return context.redirect(`https://kuara.dev${pathname}${context.url.search}`, 307);
	}
	return next();
});
