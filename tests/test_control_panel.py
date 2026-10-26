"""Exercise HTTP-to-serial boundaries against a pseudo-terminal, without a TV."""
import json
import os
from pathlib import Path
import pty
import re
import select
import socket
import subprocess
import sys
import time
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]

class PanelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.master,cls.slave=pty.openpty()
        cls.wire=bytearray()
        cls.reading=True
        def drain():
            while cls.reading:
                if select.select([cls.master],[],[],.05)[0]:
                    try: cls.wire.extend(os.read(cls.master,4096))
                    except OSError: return
        cls.reader=threading.Thread(target=drain,daemon=True)
        cls.reader.start()
        with socket.socket() as s:
            s.bind(('127.0.0.1',0)); cls.port=s.getsockname()[1]
        cls.origin=f'http://127.0.0.1:{cls.port}'
        cls.proc=subprocess.Popen([sys.executable,str(ROOT/'tools/control_panel.py'),os.ttyname(cls.slave),'--port',str(cls.port),'--log',str(ROOT/'local/panel-test-device.log')],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        for _ in range(40):
            try:
                cls.page=urlopen(cls.origin,timeout=.2).read().decode();break
            except OSError: time.sleep(.1)
        else:
            cls.proc.terminate()
            raise RuntimeError('Panel did not start: '+cls.proc.communicate(timeout=3)[1].decode())
        cls.token=json.loads(re.search(r'const token=("[^"]+")',cls.page).group(1))

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=5)
        cls.proc.stdout.close();cls.proc.stderr.close()
        cls.reading=False;cls.reader.join(timeout=1)
        os.close(cls.master);os.close(cls.slave)

    def request(self,command,token=True,origin=None):
        headers={'Content-Type':'application/json','Origin':origin or self.origin}
        if token: headers['X-Remote-Token']=self.token
        request=Request(self.origin+'/api/command',data=json.dumps({'command':command}).encode(),headers=headers)
        try:
            with urlopen(request,timeout=2) as r:return r.status,json.load(r)
        except HTTPError as e:
            with e:return e.code,json.load(e)

    def test_known_command_reaches_serial(self):
        self.assertEqual(self.request('up')[0],200)
        deadline=time.monotonic()+2
        while b'up\n' not in self.wire and time.monotonic()<deadline: time.sleep(.05)
        self.assertIn(b'up\n',self.wire)

    def test_injected_or_invalid_commands_are_rejected(self):
        for value in ['up\nhome','pin 12345','pin 1234567','pin １２３４５６','erase',None,['up']]:
            with self.subTest(value=value):self.assertEqual(self.request(value)[0],400)

    def test_missing_token_and_other_origin_are_rejected(self):
        self.assertEqual(self.request('up',token=False)[0],403)
        self.assertEqual(self.request('up',origin='https://example.com')[0],403)

    def test_status_from_device_and_pin(self):
        self.assertEqual(self.request('pin 012345')[0],200)
        os.write(self.master,b'STATUS name=Open Clicker C6 connected=1 authenticated=1 advertising=0 ready=1 bonds=1\n')
        time.sleep(.3)
        with urlopen(self.origin+'/api/log') as r:data=json.load(r)
        self.assertIn('authenticated',data['status'])
        self.assertNotIn('pin 012345','\n'.join(data['lines']))

if __name__=='__main__':unittest.main()
