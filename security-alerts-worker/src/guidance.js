// Editorially verified manufacturer guidance. Do not infer links from a CVE,
// a search result alone, or arbitrary URLs embedded in source text.
const VERIFIED = Object.freeze({
  'CVE-2026-21589': Object.freeze({
    vendor: 'Atlassian',
    url: 'https://confluence.atlassian.com/security/cve-2026-21589-arbitrary-file-access-vulnerability-impacts-multiple-products-1870495748.html',
    verifiedAt: '2026-10-19',
    titlePattern: /Atlassian/i
  })
});

export function officialGuidance(row) {
  const entry = VERIFIED[row.cve_id];
  // Match vendor as well as identifier to avoid attaching unrelated guidance.
  if (!entry || !entry.titlePattern.test(row.title || '')) {
    return { status: 'not_verified', url: null, verifiedAt: null };
  }
  return { status: 'verified', vendor: entry.vendor, url: entry.url, verifiedAt: entry.verifiedAt };
}
