#!/usr/bin/env python3
"""Loopback-only USB control panel. Run with uv run --with pyserial tools/control_panel.py PORT."""
import argparse
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import threading
import time
import serial

COMMANDS = frozenset('help status pair stop yes no up down left right ok back escape home play space volume_up volume_down mute'.split())

def valid_command(value):
    return isinstance(value, str) and (value in COMMANDS or re.fullmatch(r'pin [0-9]{6}|profile (pair )?[1-4]', value) is not None)

HTML = r'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Clicker · Bench</title>
<style>
:root{font-family:system-ui,sans-serif;color:#f5f2eb;background:#141916;color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:36px 24px}main{max-width:1000px;margin:auto}h1{font-size:36px;letter-spacing:-1px;margin:0 0 8px}.intro{color:#b7c1b9;max-width:620px;line-height:1.5}.badge{display:inline-block;font-size:12px;color:#c9ee9b;background:#293820;padding:7px 10px;border-radius:20px;margin-bottom:20px}.layout{display:grid;grid-template-columns:320px 1fr;gap:28px;margin-top:28px}.remote,.panel{background:#202822;border:1px solid #37443b;border-radius:20px;padding:24px}button,input{font:inherit}button{background:#37443b;color:#fff;border:1px solid #526255;border-radius:10px;padding:14px;cursor:pointer}button:hover{background:#465a49}button:active{transform:translateY(1px)}button:disabled{opacity:.5;cursor:wait}.dpad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:20px 0}.ok,.primary{background:#cee99d;color:#1f301e;border-color:#cee99d;font-weight:700}.wide{width:100%}.row{display:flex;gap:8px;margin-top:10px}.row>*{flex:1;min-width:0}.small{font-size:13px;color:#b7c1b9;line-height:1.5}h2{font-size:18px;margin:0 0 14px}input{background:#111812;border:1px solid #526255;border-radius:10px;padding:12px;color:white;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#111812;padding:14px;border-radius:12px;max-height:290px;overflow:auto;font:12px/1.5 ui-monospace,monospace;color:#bfceb9}#message{min-height:24px;color:#cee99d}#state{color:#dbe5d5}details{margin-top:18px}summary{cursor:pointer}a{color:#cee99d}@media(max-width:700px){.layout{grid-template-columns:1fr}.remote{max-width:350px;width:100%;margin:auto}body{padding:24px 16px}}
</style><main><span class="badge">USB BENCH PROTOTYPE</span><h1>Open Clicker</h1><p class="intro">Your C6 sends Bluetooth commands to a paired TV. Start pairing, then choose <strong>Open Clicker C6</strong> in the TV’s accessories menu.</p><div id="state">Reading device status…</div><div class="layout"><section class="remote" aria-label="Remote controls">
<button class="wide" data-cmd="home">Home</button><div class="dpad"><span></span><button data-cmd="up" aria-label="Up">↑</button><span></span><button data-cmd="left" aria-label="Left">←</button><button class="ok" data-cmd="ok">OK</button><button data-cmd="right" aria-label="Right">→</button><span></span><button data-cmd="down" aria-label="Down">↓</button><span></span></div><div class="row"><button data-cmd="back">Back</button><button data-cmd="play">Play / pause</button></div><p class="small">Each click sends one press and release. Mappings are candidates until tested on your TV.</p><details><summary>Alternative commands</summary><div class="row"><button data-cmd="escape">Escape</button><button data-cmd="space">Space</button></div><div class="row"><button data-cmd="volume_down">Vol −</button><button data-cmd="volume_up">Vol +</button></div><button class="wide" style="margin-top:8px" data-cmd="mute">Mute</button></details></section><section class="panel"><h2>Connect your TV</h2><p class="small">TCL: Settings → Remote &amp; Accessories → Pair remote or accessory. Pairing stays open for two minutes.</p><div class="row"><button class="primary" data-cmd="pair">Start pairing</button><button data-cmd="stop">Stop pairing</button></div><p class="small">If the TV shows a six-digit code, enter it here.</p><form id="pin"><div class="row"><input id="digits" aria-label="TV pairing code" placeholder="Six-digit code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off"><button>Submit code</button></div></form><details><summary>Numeric comparison</summary><p class="small">Only confirm if the device log explicitly asks you to compare matching codes on both devices.</p><div class="row"><button data-cmd="yes">Codes match</button><button data-cmd="no">Reject</button></div></details><p id="message" role="status"></p><h2>Device log</h2><pre id="log" aria-label="Device log"></pre><p class="small">A successful transmission does not prove the TV performed the action. This panel runs locally on your Mac.</p></section></div></main>
<script>
const token=__TOKEN__;let busy=false;
async function send(command){if(busy)return;busy=true;document.querySelectorAll('button').forEach(x=>x.disabled=true);try{const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json','X-Remote-Token':token},body:JSON.stringify({command})});const body=await r.json();document.getElementById('message').textContent=body.message;if(!r.ok)throw new Error(body.message);}catch(e){document.getElementById('message').textContent=e.message;}finally{busy=false;document.querySelectorAll('button').forEach(x=>x.disabled=false);}}
document.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>send(b.dataset.cmd));document.getElementById('pin').onsubmit=e=>{e.preventDefault();const input=document.getElementById('digits');if(/^[0-9]{6}$/.test(input.value)){send('pin '+input.value);input.value='';}};
async function poll(){try{const r=await fetch('/api/log');const d=await r.json();const log=document.getElementById('log');const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<45;log.textContent=d.lines.join('\n');if(atEnd)log.scrollTop=log.scrollHeight;document.getElementById('state').textContent=d.status;}catch(e){document.getElementById('state').textContent='Control panel disconnected';}setTimeout(poll,800);}poll();
</script></html>'''

class Device:
    def __init__(self, port, log_path):
        self.lines = deque(maxlen=160)
        self.status = 'USB connected; waiting for device status'
        self.lock = threading.Lock()
        self.serial = serial.Serial(port=None, baudrate=115200, timeout=.2, write_timeout=2)
        self.serial.dtr = False
        self.serial.rts = False
        self.serial.port = port
        self.serial.open()
        self.log = open(log_path, 'a', buffering=1)
        threading.Thread(target=self.read, daemon=True).start()
        self.send('status')
        threading.Thread(target=self.poll_status, daemon=True).start()

    def send(self, command):
        if not valid_command(command):
            raise ValueError('Unsupported command')
        with self.lock:
            self.serial.write((command+'\n').encode('ascii'))
            self.serial.flush()
        # Do not persist submitted passkeys.

    def read(self):
        pending = b''
        try:
            while True:
                pending += self.serial.read(4096)
                while b'\n' in pending:
                    raw,pending=pending.split(b'\n',1)
                    line=re.sub(r'\x1b\[[0-9;]*m','',raw.decode('utf-8','replace')).rstrip('\r')
                    if line:
                        self.lines.append(line)
                        self.log.write(line+'\n')
                        if line.startswith('STATUS '):
                            if 'authenticated=1' in line: self.status='Bluetooth authenticated — ready to test commands'
                            elif 'connected=1' in line: self.status='Bluetooth connected — pairing is not complete'
                            elif 'advertising=1' in line: self.status='Pairing open — choose Open Clicker C6 on the TV'
                            else: self.status='USB connected — Bluetooth not connected'
        except serial.SerialException as exc:
            self.status='USB disconnected: '+str(exc)

    def poll_status(self):
        while True:
            time.sleep(3)
            try: self.send('status')
            except (serial.SerialException,OSError): return

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('serial_port')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--log',type=Path)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    (root/'local').mkdir(exist_ok=True)
    device=Device(args.serial_port,args.log or root/'local/device-session.log')
    token=secrets.token_urlsafe(32)
    address=f'127.0.0.1:{args.port}'
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def reply(self,code,data,kind='application/json'):
            body=data.encode() if isinstance(data,str) else json.dumps(data).encode()
            self.send_response(code)
            self.send_header('Content-Type',kind+'; charset=utf-8')
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers();self.wfile.write(body)
        def authorized_host(self): return self.headers.get('Host')==address
        def do_GET(self):
            if not self.authorized_host(): return self.reply(403,{'message':'Invalid host'})
            if self.path=='/': return self.reply(200,HTML.replace('__TOKEN__',json.dumps(token)),'text/html')
            if self.path=='/api/log': return self.reply(200,{'lines':list(device.lines),'status':device.status})
            return self.reply(404,{'message':'Not found'})
        def do_POST(self):
            if not self.authorized_host() or self.headers.get('Origin')!=f'http://{address}' or self.headers.get('X-Remote-Token')!=token:
                return self.reply(403,{'message':'Request rejected'})
            if self.path!='/api/command': return self.reply(404,{'message':'Not found'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=128: raise ValueError('Invalid request size')
                data=json.loads(self.rfile.read(size))
                command=data.get('command') if isinstance(data,dict) else None
                if not valid_command(command): raise ValueError('Unsupported command')
                device.send(command)
                self.reply(200,{'message':'Sent to USB device; check the device log and TV.'})
            except (ValueError,UnicodeDecodeError) as exc: self.reply(400,{'message':str(exc)})
            except (serial.SerialException,OSError) as exc: self.reply(503,{'message':'USB error: '+str(exc)})
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Open Clicker control panel: http://{address}',flush=True)
    try: server.serve_forever()
    finally: device.serial.close();device.log.close()

if __name__=='__main__': main()
