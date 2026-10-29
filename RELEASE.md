# Cyber Care UI修正・未公開ローカル候補

公開中のcc-candidate-20261029-release-ready-1（GitHub eaf893c6f0b63add94482cb1e9fd898fd47077c4）と配信ファイルの一致を確認して作成。
ローカル候補：cc-ui-20261029-local-1。本番・GitHubへは未反映。以前の正式公開許可をこの修正版へ流用しない。
変更はトップ3ボタン、下部速報カードと旧DB導線の削除、上側画像選択1ボタン表示のみ。runtime-config、SWのリリース識別・資産ハッシュとマニフェストを追従更新。保存、復元、PDF、15分制御、端末引継ぎ、DB・Functions・収集・SNS処理は変更していない。
展開先でverify-release.cjsを実行して整合性を確認できる。承認前にアップロード・pushしない。
