#!/usr/bin/env python3
"""開発用の簡易HTTPサーバー。

`python3 -m http.server` はキャッシュ制御ヘッダーを送らないため、Chromeが
ESモジュール（.js）を積極的にキャッシュし、ファイルを編集しても通常のリロードでは
古いコードが実行され続ける問題があった（「直したのに反映されない」の原因）。

このサーバーは全レスポンスに `Cache-Control: no-store` を付け、常に最新の
ファイルを再取得させる。開発中はこちらを使う。

使い方:
    cd /Users/hanzawashu/DemoGAME/Demo_1
    python3 dev-server.py          # デフォルトポート8734
    python3 dev-server.py 8080     # ポート指定
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8734
    server = ThreadingHTTPServer(("", port), NoCacheHandler)
    print(f"開発サーバー起動: http://localhost:{port}  (Cache-Control: no-store / Ctrl+C で停止)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました")
        server.shutdown()


if __name__ == "__main__":
    main()
