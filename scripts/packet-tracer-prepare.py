"""Prepare project-local ExApp artifact without changing Packet Tracer settings."""
import json
import secrets
import subprocess
from pathlib import Path
from pt_mcp.install import find_packet_tracer
from importlib import resources

root=Path(__file__).resolve().parent.parent
out=root/'.state'/'packet-tracer'
out.mkdir(parents=True,exist_ok=True)
config=out/'connection.json'
connection=json.loads(config.read_text()) if config.exists() else {'appId':'net.netacad.cisco.hajzyymcp','key':secrets.token_hex(32)}
pt=find_packet_tracer()
if not pt.meta:
    raise RuntimeError('Cisco meta.exe unavailable')
launcher=out/'launch.cmd'
launcher.write_text('@exit /b 0\r\n')
xml=out/'PTMCP.xml'
template=resources.files('pt_mcp.data').joinpath('exapp_meta.xml.in').read_text()
for key,value in {'@APP_ID@':connection['appId'],'@APP_KEY@':connection['key'],'@EXE_PATH@':str(launcher),'@PT_VERSION@':pt.version or '8.2.2.0400'}.items():
    template=template.replace(key,value)
try:
    xml.write_text(template,encoding='iso-8859-1')
    subprocess.run([str(pt.meta),'HajzyyMCP.pta',xml.name,'-i',launcher.name],cwd=out,check=True,capture_output=True)
    config.write_text(json.dumps(connection))
finally:
    xml.unlink(missing_ok=True)
print(json.dumps({'registrationFile':str(out/'HajzyyMCP.pta'),'installedVersion':pt.version,'settingsChanged':False}))
