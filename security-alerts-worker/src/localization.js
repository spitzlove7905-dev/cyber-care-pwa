export function localizedBulletin(row) {
  const product = row.title.replace(/^【重要】/, '').replace(/の脆弱性（CVE-\d{4}-\d+）$/, '').replace(/の脆弱性$/, '');
  const confirmedKev = row.source_url === 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json' && JSON.parse(row.evidence_json).includes('CISA KEV掲載');
  return {
    ja: { title: `${product}をお使いの方へ`,
      target: `${product}を利用している方。対象バージョンは公式案内で確認してください。`,
      issue: confirmedKev ? 'この製品の安全上の問題が、実際の攻撃に使われたとCISA（米国のサイバーセキュリティ機関）が確認しています。' : '安全上の問題について、公式の説明を確認してください。',
      action: 'メーカーの公式案内で対象か確認し、案内された修正や回避策を実施してください。対策がない場合は、使用停止が必要か確認してください。',
      summary: confirmedKev ? `${product}の脆弱性（${row.cve_id}）がCISAの既知の悪用された脆弱性カタログに掲載されています。` : '詳細は公式情報で確認してください。',
      recommendedAction: '利用製品とバージョンが対象か、メーカーの公式案内で確認してください。具体的な修正・緩和策と期限は、英語の公式原文およびメーカーの案内を確認してください。',
      label: '公式情報に基づく日本語要約（全文翻訳ではありません）' },
    en: { title: `Security alert: ${product}`, target: `People using ${product}. Check the official advisory for affected versions.`, issue: confirmedKev ? 'CISA confirms that a security issue in this product has been exploited in attacks.' : 'Check the official advisory for details of the security issue.', action: 'Check whether your product is affected and follow the vendor’s update or mitigation instructions. If no mitigation is available, check whether use should be discontinued.', summary: row.summary, recommendedAction: row.recommended_action, label: 'Official advisory (original English)' }
  };
}
