/**
 * Reusable SEC EDGAR search utilities.
 * Extracted from fund-intelligence for shared use.
 */

const SEC_HEADERS = {
  "User-Agent": "Relai CRM support@relai.com",
  Accept: "application/json",
};

const EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions";

export interface SECFiler {
  cik: string;
  name: string;
  filingDate?: string;
  filingType?: string;
}

export interface SECFiling {
  filingDate: string;
  filingUrl: string;
  accessionNumber: string;
  formType: string;
}

/**
 * Search SEC EDGAR full-text index for a company by name.
 * Returns the best matching filer with CIK.
 */
export async function searchSECFiler(
  companyName: string,
  options: { formTypes?: string[]; maxResults?: number } = {},
): Promise<SECFiler | null> {
  const searchName = companyName.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const forms = options.formTypes?.join(",") || "13F-HR";
  const today = new Date().toISOString().split("T")[0];
  const eighteenMonthsAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 18); return d.toISOString().split("T")[0]; })();

  // Try specific date-ranged search first
  try {
    const resp = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(searchName)}%22&forms=${forms}&dateRange=custom&startdt=${eighteenMonthsAgo}&enddt=${today}&from=0&size=3`,
      { headers: SEC_HEADERS },
    );
    if (resp.ok) {
      const data = await resp.json();
      const hit = data.hits?.hits?.[0]?._source;
      if (hit?.ciks?.[0]) {
        return {
          cik: hit.ciks[0],
          name: hit.display_names?.[0] || companyName,
          filingDate: hit.file_date || undefined,
          filingType: forms.split(",")[0],
        };
      }
    }
  } catch {}

  // Fallback: broader search without date range
  try {
    const resp = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(searchName)}%22&forms=${forms}`,
      { headers: SEC_HEADERS },
    );
    if (resp.ok) {
      const data = await resp.json();
      const hit = data.hits?.hits?.[0]?._source;
      if (hit?.ciks?.[0]) {
        return {
          cik: hit.ciks[0],
          name: hit.display_names?.[0] || companyName,
          filingDate: hit.file_date || undefined,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Fetch basic submissions data for a CIK (company name, filings, SIC code, etc.).
 */
export async function fetchSubmissions(cik: string): Promise<any | null> {
  const paddedCik = cik.padStart(10, "0");
  try {
    const resp = await fetch(`${EDGAR_SUBMISSIONS}/CIK${paddedCik}.json`, { headers: SEC_HEADERS });
    if (resp.ok) return await resp.json();
  } catch {}
  return null;
}

/**
 * Fetch recent filings of specified types for a CIK.
 */
export async function fetchCompanyFilings(
  cik: string,
  formTypes: string[] = ["13F-HR", "13F-HR/A"],
  limit = 5,
): Promise<SECFiling[]> {
  const submissions = await fetchSubmissions(cik);
  if (!submissions?.filings?.recent) return [];

  const recent = submissions.filings.recent;
  const filings: SECFiling[] = [];

  for (let i = 0; i < (recent.form?.length || 0) && filings.length < limit; i++) {
    if (formTypes.includes(recent.form[i])) {
      const accession = recent.accessionNumber[i].replace(/-/g, "");
      const primaryDoc = recent.primaryDocument[i];
      filings.push({
        filingDate: recent.filingDate[i],
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${primaryDoc}`,
        accessionNumber: recent.accessionNumber[i],
        formType: recent.form[i],
      });
    }
  }

  return filings;
}

/**
 * Search SEC EDGAR for investment-related entities.
 * Used for account discovery to find potential prospects.
 */
export async function searchSECEntities(
  query: string,
  options: { forms?: string; maxResults?: number } = {},
): Promise<SECFiler[]> {
  const forms = options.forms || "13F-HR";
  const max = options.maxResults || 20;

  try {
    const resp = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&forms=${forms}&from=0&size=${max}`,
      { headers: SEC_HEADERS },
    );

    if (!resp.ok) return [];

    const data = await resp.json();
    const hits = data.hits?.hits || [];
    const seen = new Set<string>();
    const results: SECFiler[] = [];

    for (const hit of hits) {
      const src = hit._source;
      const cik = src?.ciks?.[0];
      if (!cik || seen.has(cik)) continue;
      seen.add(cik);
      results.push({
        cik,
        name: src.display_names?.[0] || src.entity_name || "Unknown",
        filingDate: src.file_date || undefined,
        filingType: forms.split(",")[0],
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Get basic company info from submissions endpoint.
 */
export async function getCompanyInfo(cik: string): Promise<{
  name: string;
  sic: string;
  sicDescription: string;
  stateOfIncorporation: string;
  addresses: any;
} | null> {
  const submissions = await fetchSubmissions(cik);
  if (!submissions) return null;

  return {
    name: submissions.name || "Unknown",
    sic: submissions.sic || "",
    sicDescription: submissions.sicDescription || "",
    stateOfIncorporation: submissions.stateOfIncorporation || "",
    addresses: submissions.addresses || {},
  };
}
