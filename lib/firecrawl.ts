const FIRECRAWL_API = "https://api.firecrawl.dev";

const SOCIAL_DOMAINS: Record<string, string> = {
  "linkedin.com/company": "linkedin",
  "facebook.com": "facebook",
  "instagram.com": "instagram",
  "youtube.com": "youtube",
  "tiktok.com": "tiktok",
  "twitter.com": "twitter",
  "x.com": "x",
};

export interface WebsiteScrapeResult {
  text: string;                               // formatted context for Gemini
  address: string | null;                     // for Places API
  socialLinks: Record<string, string> | null; // deterministic from page links
}

// F1: scrape company website — social links via /links (deterministic), address via /extract
export async function scrapeCompanyWebsite(domain: string): Promise<WebsiteScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { text: "", address: null, socialLinks: null };

  const url = domain.startsWith("http") ? domain : `https://${domain}`;

  try {
    const res = await fetch(`${FIRECRAWL_API}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["links", "extract"],
        extract: {
          prompt: "Wyciągnij adres biura (ulica, kod pocztowy, miasto) i numer telefonu stacjonarnego.",
          schema: {
            type: "object",
            properties: {
              address: { type: "string" },
              phone: { type: "string" },
              business_description: { type: "string" },
            },
          },
        },
        timeout: 30000,
      }),
    });

    if (!res.ok) return { text: "", address: null, socialLinks: null };

    const data = await res.json();
    const pageData = data?.data;
    if (!pageData) return { text: "", address: null, socialLinks: null };

    // --- Social links: deterministic from all page links ---
    const allLinks: string[] = pageData.links ?? [];
    const socialLinks: Record<string, string> = {};
    for (const link of allLinks) {
      for (const [domainKey, label] of Object.entries(SOCIAL_DOMAINS)) {
        if (link.includes(domainKey) && !socialLinks[label]) {
          // Skip generic/home pages like linkedin.com/company without slug
          const cleanUrl = link.split("?")[0].replace(/\/$/, "");
          if (cleanUrl.split("/").length >= 5) {
            socialLinks[label] = cleanUrl;
          }
        }
      }
    }

    // --- Address/description from extract ---
    const extracted = pageData.extract;
    const address = extracted?.address ?? null;

    const parts: string[] = [`=== DANE ZE STRONY FIRMOWEJ (${url}) ===`];
    if (extracted?.business_description) parts.push(`Opis: ${extracted.business_description}`);
    if (address) parts.push(`Adres: ${address}`);
    if (extracted?.phone) parts.push(`Telefon: ${extracted.phone}`);
    if (Object.keys(socialLinks).length > 0) {
      parts.push(
        `Social media (ze strony): ${Object.entries(socialLinks)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}`
      );
    }

    return {
      text: parts.join("\n"),
      address,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
    };
  } catch {
    return { text: "", address: null, socialLinks: null };
  }
}
