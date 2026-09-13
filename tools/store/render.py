#!/usr/bin/env python3
"""Serve the repository root plus a /save endpoint used by tools/store/screenshots.html.

    python tools/store/render.py            # then open http://127.0.0.1:8770/tools/store/screenshots.html

The page renders the store screenshots with html2canvas and POSTs the PNGs here; they land in
assets/store/. Ctrl+C to stop.
"""
import base64
import json
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'store')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        if self.path != '/save':
            self.send_response(404)
            self.end_headers()
            return
        n = int(self.headers.get('content-length', 0))
        files = json.loads(self.rfile.read(n))
        os.makedirs(OUT, exist_ok=True)
        written = []
        for name, data_url in files.items():
            safe = ''.join(c for c in name if c.isalnum() or c in '-_')
            path = os.path.join(OUT, safe + '.png')
            with open(path, 'wb') as f:
                f.write(base64.b64decode(data_url.split(',', 1)[1]))
            written.append(f'{safe}.png ({os.path.getsize(path)} bytes)')
        body = json.dumps(written).encode()
        self.send_response(200)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    print(f'open http://127.0.0.1:{port}/tools/store/screenshots.html')
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()
