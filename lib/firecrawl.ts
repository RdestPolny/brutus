const FIRECRAWL_API = "https://api.firecrawl.dev";

export interface WebsiteScrapeResult {
  text: string;        // formatted context for Gemini
  address: string | null; // extracted address for Places API
}

// F1: scrape company website for structured context — business description, contact, social links
export async function scrapeCompanyWebsite(domain: string): Promise<WebsiteScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { text: "", address: null };

  try {
    const url = domain.startsWith("http") ? domain : `https://${domain}`;

    const res = await fetch(`${FIRECRAWL_API}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["extract"],
        extract: {
          prompt:
            "Wyciągnij: opis działalności firmy i model biznesowy, adres biura i telefon, linki do social mediów (LinkedIn, Facebook, Instagram, YouTube, TikTok, X/Twitter), datę ostatniej aktualizacji strony, informacje o zespole lub strukturze firmy jeśli widoczne.",
          schema: {
            type: "object",
            properties: {
              business_description: { type: "string" },
              business_model: { type: "string" },
              address: { type: "string" },
              phone: { type: "string" },
              social_links: {
                type: "object",
                properties: {
                  linkedin: { type: "string" },
                  facebook: { type: "string" },
                  instagram: { type: "string" },
                  youtube: { type: "string" },
                  tiktok: { type: "string" },
                  twitter: { type: "string" },
                },
              },
              last_updated: { type: "string" },
              team_info: { type: "string" },
            },
          },
        },
        timeout: 30000,
      }),
    });

    if (!res.ok) return { text: "", address: null };

    const data = await res.json();
    const extracted = data?.data?.extract;
    if (!extracted) return { text: "", address: null };

    const parts: string[] = [`=== DANE ZE STRONY FIRMOWEJ (${url}) ===`];
    if (extracted.business_description)
      parts.push(`Opis: ${extracted.business_description}`);
    if (extracted.business_model) parts.push(`Model biznesowy: ${extracted.business_model}`);
    if (extracted.address) parts.push(`Adres: ${extracted.address}`);
    if (extracted.phone) parts.push(`Telefon: ${extracted.phone}`);
    if (extracted.team_info) parts.push(`Zespół: ${extracted.team_info}`);
    if (extracted.last_updated) parts.push(`Ostatnia aktualizacja: ${extracted.last_updated}`);

    const socials = extracted.social_links;
    if (socials) {
      const links = Object.entries(socials)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`);
      if (links.length > 0) parts.push(`Social media (ze strony): ${links.join(", ")}`);
    }

    return {
      text: parts.join("\n"),
      address: extracted.address ?? null,
    };
  } catch {
    return { text: "", address: null };
  }
}
