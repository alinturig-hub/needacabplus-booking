"""Local read-only map comparison. Never forwards booking or authentication requests."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import urllib.request
ROOT=Path(__file__).resolve().parents[2]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  paths={'/':('tools/map-comparison/index.html','text/html'),'/maplibre.js':('node_modules/maplibre-gl/dist/maplibre-gl.js','text/javascript'),'/maplibre.css':('node_modules/maplibre-gl/dist/maplibre-gl.css','text/css'),'/car.png':('public/car-marker-live.png','image/png')}
  try:
   if self.path=='/config':
    data=urllib.request.urlopen('https://webapp.needacabplus.app/api/map/config',timeout=15).read();mime='application/json'
   elif self.path in paths:
    path,mime=paths[self.path];data=(ROOT/path).read_bytes()
   else:self.send_error(404);return
   self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
  except Exception:self.send_error(502,'Preview resource unavailable')
if __name__=='__main__':
 print('Map comparison: http://127.0.0.1:8765',flush=True)
 ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
