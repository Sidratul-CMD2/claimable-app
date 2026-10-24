/** Site identity. "Claimable" is a working name; the final product name is still to be decided. */
export const site = {
  name: "Claimable",
  tagline: "Find the right deal. Know whether you qualify. Understand the real cost.",
  description:
    "Software discounts, student offers, promo codes, free trials and lifetime deals — with country eligibility, renewal prices and verification evidence.",
  // On Vercel, fall back to the project's production domain so canonical URLs never point at localhost.
  url: (
    process.env.SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, ""),
  botUserAgent: process.env.CONNECTOR_USER_AGENT ?? "ClaimableBot/0.1 (+offer monitoring; contact via site)",
};

export const COUNTRY_COOKIE = "claimable_country";
export const SESSION_COOKIE = "claimable_session";
