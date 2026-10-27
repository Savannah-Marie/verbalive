import http.server
import socketserver

PORT = 8777

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Always serve fresh files (prevents the browser caching old JS/CSS).
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print("LinguaLive serving on http://localhost:%d (no-cache)" % PORT)
    httpd.serve_forever()
