# Cyber Care：重大セキュリティ情報データベース

既存の `feat/security-alerts-foundation`（基準コミット `28992f65c5c70b200ce05734ffadb843f9b620ee`）に追加。
質問ボタン、5W1H、相談文、相談先、画像保存などの相談処理は維持。
`enhancements.js` / `briefing.js` / Workerの既存Cron・環境変数・D1バインディングは変更しない。

## 構成

- Pages：トップに入口を1つ追加。`security-database.html` に検索・7種の並べ替え・複合絞り込み・30件ずつのカード表示。
- Pages Functions：`/api/security/status` と `/api/security/database`。`wrangler.jsonc` のサービスバインディング `SECURITY_ALERTS` で既存Workerを呼び出す。管理APIや任意URLへのプロキシを禁止。D1の追加バインディングは不要。
- Worker：既存CISA KEVにJPCERT/CC公式RSSを追加。最新90日と、90日より前のランサムウェア利用が確認されたKEV項目を収録。既存記事は削除しない。
- D1：既存 `alerts` / `source_state` / `social_runs` を使用。マイグレーション0004で事件詳細、情報源、収集実行結果、記事改訂ごとの配信履歴を追加。
- 管理者：既存Cloudflare Access認証下の `/admin/database` で事件JSONを登録・更新。漏えい・組織被害・進行中の事件など、RSS外の情報も保存できる。同一事件は同じeventKeyで更新。単一CVEは共通事件キーに統合。
- 新しい有料API・有料サービスの契約やプラン変更は行わない。

## 日時と確認状態

収集を開始すると `running` を保存し、取得・解析・保存がすべて完了した後だけ完了時刻を保存する。
全情報源成功時は `success`、一部だけ成功した場合は `partial`、すべて失敗した場合は `failed`。
表示する最終確認日時は `success` 実行の `completed_at`。部分成功・失敗はこの日時を更新しない。
部分成功の完了時刻は別表示し、情報源ごとの状態も示す。初回成功前は「最終確認日時：未確認」。
ページ閲覧時刻・端末の現在時刻から最終確認日時を作らない。日本時間で表示し、全事件の網羅を保証する日時ではないと明示する。
APIは `no-store`。Service Workerも `/api/` をキャッシュ・オフラインフォールバック対象から外す。
発生日・情報源の更新日・CVSSは不明ならnull。日付しか分からない公開日には「時刻不明」を表示。
旧インポーターが更新日として保存していたCISA対策期限は、0004で更新日から除去する。

## 配信

既存の日本時間08:00・18:00、15分間隔Cron、緊急配信の明示操作による1枠は維持。
直近の収集が全情報源成功でなければ、新規ゼロと判定せず配信を中止する。
未配信の新規重大情報を優先し、重大情報の改訂、次に過去90日の注意が必要な記事を最大5件選ぶ。
過去記事は「過去の重大事件・注意喚起（新着速報ではありません）」と明示。件数合わせはしない。
過去記事は同一改訂を再配信せず、過去30日以内の不要な再紹介も抑える。配信結果不明は自動再送しない。
記事単位の履歴・改訂ハッシュと、配信枠・プラットフォームの一意制約で重複を抑止する。
未確認の被害情報を含む手動記事は自動配信しない。重大度が未評価のRSS記事も自動配信しない。

## 公開手順

既存のCloudflareアカウント・Worker・Pagesを使用する。認証済み環境で以下を行う。
Cloudflareのログイン権限を変更する画面は利用者が確認する。

```powershell
# リポジトリ直下
cd security-alerts-worker
npm ci
npx wrangler whoami

# 既存データのバックアップ（公開フォルダー外へ保存する）
npx wrangler d1 export cyber-care-security-alerts --remote --output ../../cyber-care-before-database.sql
npx wrangler d1 migrations list cyber-care-security-alerts --remote
npx wrangler d1 migrations apply cyber-care-security-alerts --remote
npx wrangler deploy

cd ..
node scripts/build-pages.mjs
node security-alerts-worker/node_modules/wrangler/bin/wrangler.js pages deploy dist --project-name cyber-care-pwa
```

PagesのGit連携を使う場合：ルートはリポジトリ直下、ビルドコマンドは `node scripts/build-pages.mjs`、出力は `dist`。
`functions` は `dist` の外、リポジトリ直下に置く。ダッシュボードへの静的ZIPのドラッグ＆ドロップだけではFunctionsを公開できない。
静的公開物は明示した15ファイルだけをコピーし、Workerソース・node_modules・認証ファイルを公開物に含めない。
既存のSecrets（Buffer等）は維持。新しいニュースAPIキーは不要。

Workerを先に更新し、その後Pagesを反映する。最初の15分間隔Cronの正常完了後、日時が自動で表示される。
それまでは「未確認」と表示する。移行前のsource_stateから全情報源成功日時を推測して埋めない。
本番確認では `/v1/database/status`、Pagesの `/api/security/status`、相談導線、検索、配信枠を確認する。

## 収録範囲・残る運用作業

- 自動収集元はCISA KEVとJPCERT/CCの注意喚起RSS。全報道機関や全企業発表を網羅する収集は実装していない。
- JPCERT/CC RSSには掲載件数制限があるため、初回に過去90日のJPCERT記事すべてを遡及取得する機能は未対応。初回から90日分を完全収録済みとは表示しない。
- 大規模漏えい・企業ランサムウェア被害などRSS外の事件は、管理者が一次情報・信頼できる報道を確認して登録する必要がある。
- KEVの実悪用・ランサムウェア利用実績は、現在進行中の攻撃や現在の被害継続の断定に使わない。対象利用者の対策確認が必要な項目として示す。
- 自動記事の重大度「高」は実悪用の公的確認を根拠とする独自の定性的評価。CVSSではない。RSSで重大度が不明なら「未評価」。
- 手動で編集した記事は自動収集で上書きしない。情報源の確認・内容更新は管理者が行う。拒否・取り下げは自動再公開しない。
- 公開APIは最大10,000記事までの取得。現在の検証規模は463記事。将来これを超える場合のサーバーページングは未対応。
- 実際のSNS投稿は既存のBuffer接続・アカウント状態に依存する。テストでは外部送信を模擬し、検証目的の本番投稿は送らない。

公式資料：
[JPCERT/CC RSS](https://www.jpcert.or.jp/rss/)、
[Pages Functions配置・公開方法](https://developers.cloudflare.com/pages/functions/get-started/)、
[D1制限](https://developers.cloudflare.com/d1/platform/limits/)。
