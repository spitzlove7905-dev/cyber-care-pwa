// Read the same preference as the main page; never overwrite it from this page.
export function databaseLanguage(search='',storage){
 const explicit=new URLSearchParams(search).get('lang');
 if(['ja','en'].includes(explicit))return explicit;
 try{const saved=storage?.getItem('cc-lang');if(['ja','en'].includes(saved))return saved;}catch{}
 return 'ja';
}
export const english={
 '重大セキュリティ情報データベース | Cyber Care':'Major Security Information Database | Cyber Care',
 '← Cyber Careへ戻る':'← Back to Cyber Care','重大セキュリティ情報':'Major Security Information','データベース':'Database',
 '概要':'Summary','利用者が取るべき対策':'Actions users should take','対象企業・組織':'Affected company / organization','発生日':'Incident date','情報公開日':'Publication date','最終更新日（データベース）':'Database last updated','情報源の更新日':'Source last updated','確認区分':'Confirmation status','重大度の根拠':'Severity rationale','緊急性の根拠':'Urgency rationale','被害状況':'Known impact','現在の対応状況':'Current response','情報源':'Sources','不明':'Unknown',
 '最新速報':'Recent advisory','過去の重大事件・注意喚起':'Past incidents / advisories','注意':'Caution','進行中':'Ongoing','対応中':'Response ongoing','解決':'Resolved','脆弱性':'Vulnerability','ランサムウェア':'Ransomware','個人情報漏えい':'Personal data breach','不正アクセス':'Unauthorized access','注意喚起':'Advisory','その他':'Other','重大':'Critical','高':'High','中':'Medium','低':'Low','未評価':'Not assessed',
 '情報源に記載なし（独自のCVSSは付与しません）':'Not provided by the source (no invented CVSS score)',
 'セキュリティ情報の最終確認日時':'Security information last checked','最終確認日時：未確認':'Last checked: not yet confirmed',
 '最新の速報、過去の重大事件、継続して注意が必要な情報をまとめて確認できます。':'Browse recent advisories, past major incidents, and information requiring continued attention.',
 '※情報収集・確認処理が最後に正常完了した日時です。ページ閲覧時刻ではありません。':'This is when collection and verification last completed successfully, not when this page was opened.',
 'キーワード検索':'Keyword search','並べ替え':'Sort by','緊急性の高い順':'Urgency: highest first','重大度の高い順':'Severity: highest first','最新情報順（情報公開日）':'Latest publication first','発生日の新しい順':'Incident date: newest first','発生日の古い順':'Incident date: oldest first','企業名・事件名の五十音／アルファベット順':'Organization / incident name','最終更新日の新しい順':'Last updated: newest first','情報の種類':'Information type','すべて':'All','最新速報（公開から7日以内）':'Recent (published within 7 days)','過去の重大事件（公開から7日超）':'Past (published more than 7 days ago)','継続中の注意喚起':'Ongoing advisories','重大度':'Severity','攻撃の種類':'Attack type','公開日の期間':'Publication period','全期間':'All dates','過去7日間':'Past 7 days','過去30日間':'Past 30 days','過去90日間':'Past 90 days','条件をリセット':'Reset filters','続きを表示':'Show more','データを読み込んでいます…':'Loading data…','質問・5W1Hの相談準備へ':'Prepare your questions and consultation notes',
 '条件に一致する情報がありません。':'No information matches these filters.','公開済み情報はまだありません。収集状態を確認してください。':'No published information yet. Check collection status.',
 '過去90日より前でも、対策確認が必要な情報を収録します。CISA KEV掲載は実悪用の確認であり、現在も攻撃が進行中であるという断定ではありません。':'Older information may be included when action still needs review. CISA KEV inclusion confirms known exploitation, not necessarily an ongoing attack.',
 '重大度はCVSS・実被害・社会的影響の確認範囲で評価します。緊急性は実悪用・拡大の可能性・対策の必要性で評価し、根拠を各記事に表示します。CVSSがない事件にスコアを付けません。発生日不明の記事は発生日順の末尾に表示します。漢字の組織名は読み情報がある場合に読み順で並べます。':'Severity reflects verified CVSS, impact and social consequences. Urgency reflects exploitation, possible spread and required action. Each record states its rationale. Missing CVSS scores are not invented. Unknown incident dates sort last. Japanese organization names use readings when available.'
};
export function databaseText(value,lang){return lang==='en'?(english[value]||value):value;}
export function databaseBody(record,field,lang){
 const translated=record.translations?.[lang]?.[field];
 const original=typeof record[field]==='string'?record[field]:'';
 if(typeof translated==='string'&&translated.trim())return {text:translated,language:lang,translated:true,notice:null};
 // Never pretend an original-language field has been translated.
 const sourceLanguage=record.contentLanguage||(/[\u3040-\u30ff\u3400-\u9fff]/u.test(original)?'ja':'en');
 const status=record.translationStatus?.[lang]?.[field];
 const state=lang==='ja'?(status==='failed'?'翻訳に失敗しました。':status==='processing'||status==='pending'?'翻訳処理待ちです。':''):(status==='failed'?'Translation failed. ':status==='processing'||status==='pending'?'Translation is pending. ':'');
 return {text:original,language:sourceLanguage,translated:false,notice:original&&sourceLanguage!==lang?state+(lang==='ja'?'日本語訳は未提供です。以下は情報源の原文です。':'An English translation is not available. The original source text follows.'):null};
}
