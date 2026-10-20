import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// A frontend-only deploy (preview mode) has no server to add the canonical link, robots.txt and sitemap, so the build does it.
// In the full deploy the server does it per page, so this plugin stays out of the way.
const staticSeo = (site: string): Plugin => ({
  name: "deadroom-static-seo",
  transformIndexHtml: (html) => html.replace("<!--canonical-->", site ? `<link rel="canonical" href="${site}/" />` : ""),
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ""}` });
    if (site) this.emitFile({ type: "asset", fileName: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc></url>\n</urlset>\n` });
  },
});

// Fill in %VITE_SITE_URL% ourselves so a missing "https://" does not end up in the page's meta tags.
const siteUrl = (site: string): Plugin => ({
  name: "deadroom-site-url",
  transformIndexHtml: { order: "pre", handler: (html) => html.replaceAll("%VITE_SITE_URL%", site) },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const raw = (env.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "");
  const site = raw && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw;
  return {
    plugins: [react(), siteUrl(site), ...(env.VITE_PREVIEW === "1" ? [staticSeo(site)] : [])],
    server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
  };
});
