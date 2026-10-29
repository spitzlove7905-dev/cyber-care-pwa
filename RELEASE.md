# 公開・復帰用ソース（未公開）

この一式はローカルで検証した公開候補です。本番反映・GitHubへのpush・プレビュー公開は行っていません。実行には利用者の明示許可が必要です。

- `dist/`：同じ正式URLのルートへ配信する静的ファイル。
- `functions/`：プロジェクト直下のPages Functions。distへ移動しないでください。
- `wrangler.jsonc`：現在のプロジェクト名、dist出力、互換日、既存SECURITY_ALERTS接続。
- `.gitattributes`：Gitによる配布バイトの改行変換を防止します。削除しないでください。
- `release-manifest.json`：固定したリリースIDとSHA-256。
- `verify-release.cjs`：ネットワーク通信・書込みのないローカル照合。`node verify-release.cjs` がPASSになることを確認します。

GitHub適用用差分の基点はmainの固定コミットce6b1db6d52efc43865a7326650ce78a00ca5e48です。別のHEADへ無理に適用しないでください。Windowsで差分を確認/適用するときはGitのcore.autocrlf=falseを指定し、適用後に必ず照合します。pushは本番/プレビューを起動し得るため、許可前には行わないでください。

復帰には別途固定した復帰専用版を使います。旧DBしか読めない現行旧版への単純差戻しは使用しません。同じ正式オリジンで配布し、既存記録・画像・相談文を削除・初期化しません。復帰専用版は今後の修正に合わせて上書き再生成せず、検証済みZIPとハッシュを保持してください。
