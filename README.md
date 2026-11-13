# Plate Log

ウエイトトレーニングの記録アプリ。画面は GitHub Pages、データは Google スプレッドシート(Google Apps Script)に集まります。
スマホではホーム画面に追加すると、普通のアプリのように起動できます。

```
docs/   GitHub Pages で公開するアプリ本体(index.html はビルドで生成)
gas/    Apps Script に貼るコード(Code.gs / Index.html)
tools/  build.py: gas/Index.html から docs/index.html を作る
```

## 初回設定

### 1. サーバー(Apps Script)を更新する
1. スプレッドシートの「拡張機能」→「Apps Script」を開き、`gas/Code.gs` を コード.gs に、`gas/Index.html` を Index.html に貼り替えて保存。
2. 関数のプルダウンで `setup` を選んで実行。「設定」タブの A2 に「チームパスコード」の行ができる。
3. 「設定」タブに入力する。
   - B1:管理者パスコード(コーチ・スタッフ用、4文字以上)
   - B2:チームパスコード(選手全員に伝える)
4. 「デプロイ」→「デプロイを管理」→ 選手に配っているデプロイを選ぶ → 鉛筆 →
   「アクセスできるユーザー」を **全員** に変更 → バージョン「新バージョン」→「デプロイ」。URL(/exec)は変わらない。

### 2. アプリにサーバーURLを書く
`docs/config.js` の `window.PLATE_API = "..."` に、手順1-4のデプロイの /exec URL を貼る。

### 3. GitHub Pages で公開する
リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/docs` にして Save。
数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開ける。

## 選手の使い方
1. 上のURLをスマホで開き、チームパスコードを入力 → 自分の名前を選ぶ。
2. ホーム画面に追加する。
   - iPhone(Safari):共有ボタン →「ホーム画面に追加」
   - Android(Chrome):︙ →「ホーム画面に追加」/「アプリをインストール」
3. ホーム画面から開くと、初回だけもう一度パスコードと名前を選ぶ(端末に記憶される)。

## コーチの使い方
アプリ画面の一番下「管理者ログイン」で管理者パスコードを入力すると、「チーム」「メニュー」タブが使える。

## 更新するとき
- 画面を変えた:`gas/Index.html` を編集 → `python3 tools/build.py` → `docs/` をコミット。Apps Script 側の Index.html も貼り替える(旧URL用)。
- サーバーを変えた:`gas/Code.gs` を Apps Script に貼り替え →「デプロイを管理」で新バージョンをデプロイ。

## パスコードを変えるとき
「設定」タブの B1 / B2 を書き換えるだけ。変更後、選手・管理者は次回起動時に新しいパスコードの入力を求められる。

## 注意
- 名簿の名前を選べば誰でもその名前で記録できます(個人ごとのログインはありません)。
- 記録はスプレッドシートにあり、アプリやコードを更新しても消えません。
