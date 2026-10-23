"""Check startup/console without sending any input to a host."""
import argparse
from pathlib import Path
import time
import serial
p=argparse.ArgumentParser();p.add_argument('port');args=p.parse_args()
s=serial.Serial(port=None,baudrate=115200,timeout=.2,write_timeout=2)
s.dtr=False;s.rts=False;s.port=args.port;s.open()
received=bytearray()
def capture(seconds):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline: received.extend(s.read(4096))
capture(2)
for command in ('status','help','up','not_a_command','x'*100,'status','pair'):
    s.write((command+'\n').encode());s.flush();capture(1.4)
capture(1)
s.close()
text=received.decode('utf-8','replace')
root=Path(__file__).resolve().parents[1]
(root/'local/board-check.log').write_text(text)
checks={
 'stack_ready':'ready=1' in text,
 'disconnected_action_rejected':'ERR not authenticated; action discarded' in text,
 'unknown_command_rejected':'ERR unknown command' in text,
 'long_command_rejected':'ERR command too long; discarded' in text,
 'pairing_started':'Advertising start status=0' in text,
}
for name,ok in checks.items():print(f'{name}: {"PASS" if ok else "FAIL"}')
if not all(checks.values()):
    print(text)
    raise SystemExit(1)
