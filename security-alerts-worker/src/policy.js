const OFFICIAL_CISA_KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

export const SOURCES = Object.freeze([
  Object.freeze({
    key: 'cisa-kev',
    name: 'CISA Known Exploited Vulnerabilities Catalog',
    url: OFFICIAL_CISA_KEV_URL,
    official: true
  })
]);

/**
 * The KEV feed is a historical catalogue. A critical-alert monitor only needs
 * newly added records (plus records from the day before a short outage), not a
 * full catalogue rewrite on every scheduled run.
 */
export function shouldMonitorKevRecord(record, lastSuccessfulFetchAt, now = new Date(), initialLookbackDays = 30) {
  if (!record?.dateAdded || !/^\d{4}-\d{2}-\d{2}$/.test(record.dateAdded)) return false;
  const cutoff = lastSuccessfulFetchAt
    ? new Date(lastSuccessfulFetchAt).toISOString().slice(0, 10)
    : new Date(now.getTime() - initialLookbackDays * 86_400_000).toISOString().slice(0, 10);
  return record.dateAdded >= cutoff;
}

export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeCve(value) {
  const match = cleanText(value).toUpperCase().match(/^CVE-\d{4}-\d{4,}$/);
  return match?.[0] ?? null;
}

export function scoreCandidate(candidate) {
  const evidence = [];
  let score = 0;
  if (candidate.official) {
    score += 20;
    evidence.push('公式一次情報');
  }
  if (candidate.knownExploited) {
    score += 45;
    evidence.push('公的機関が実悪用を確認');
  }
  if (candidate.inKevCatalog) {
    score += 35;
    evidence.push('CISA KEV掲載');
  }
  if (candidate.recommendedAction || candidate.requiredAction) {
    score += 5;
    evidence.push('公式の対処案内あり');
  }
  return { score: Math.min(score, 100), evidence };
}

export function buildJapaneseBulletin(candidate) {
  const cve = candidate.cveId ? `（${candidate.cveId}）` : '';
  return {
    title: `【重要】${candidate.vendorProject} ${candidate.product}の脆弱性${cve}`,
    summary: cleanText(candidate.shortDescription),
    recommendedAction: cleanText(candidate.requiredAction),
    uncertainty: 'この速報は公式一次情報に基づきます。利用中かどうかは、ご自身の製品名・バージョンを公式の案内で確認してください。'
  };
}

export function candidateFromKev(item) {
  const cveId = normalizeCve(item.cveID);
  const vendorProject = cleanText(item.vendorProject);
  const product = cleanText(item.product);
  const requiredAction = cleanText(item.requiredAction);
  if (!cveId || !vendorProject || !product || !requiredAction) return null;

  const candidate = {
    official: true,
    knownExploited: true,
    inKevCatalog: true,
    cveId,
    vendorProject,
    product,
    requiredAction,
    shortDescription: cleanText(item.shortDescription),
    dateAdded: cleanText(item.dateAdded),
    dueDate: cleanText(item.dueDate),
    sourceUrl: OFFICIAL_CISA_KEV_URL
  };
  const { score, evidence } = scoreCandidate(candidate);
  const bulletin = buildJapaneseBulletin(candidate);
  return {
    ...candidate,
    ...bulletin,
    score,
    evidence,
    eventKey: `cve:${cveId}:cisa-kev`
  };
}

export function publicationDecision(candidate, autoPublishEnabled) {
  const isComplete = candidate.official && candidate.cveId && candidate.recommendedAction && candidate.sourceUrl;
  const eligible = Boolean(isComplete && candidate.score >= 70);
  return {
    eligible,
    status: eligible && autoPublishEnabled ? 'published' : 'pending_review',
    reason: eligible
      ? (autoPublishEnabled ? '公式確認済み・根拠十分・自動公開が有効' : '公式確認済み。ただし自動公開は無効')
      : '根拠、対象、または対処情報が不足'
  };
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
