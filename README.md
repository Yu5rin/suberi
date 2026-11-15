# すべり石（ブラウザ版）

氷の上の石をはじいて、朱の石を的（朱の枠）に入れるパズル。Android版「すべり石」v0.1.0 をブラウザ向けに移植したもの。全8章160面。

遊ぶ：https://yu5rin.github.io/suberi/

## 操作
- スマホ：石をスワイプ（はじく）
- PC：石をクリック（または Tab／数字キー）で選び、矢印キーで滑らせる。Z でもどす、R でやりなおし、H でヒント

## 構成
- `index.html` … 公開用の単一ファイル（エンジン・面データ・効果音を埋め込み済み）
- `src/` … ソース。`src/engine.js` が盤面ロジックと最短手順探索、`src/game.js` が画面・操作・描画、`src/levels.txt` が面データ
- 再生成：`cd src && python3 build.py` で `src/dist/web/index.html` ができるので、ルートの `index.html` に上書きする
