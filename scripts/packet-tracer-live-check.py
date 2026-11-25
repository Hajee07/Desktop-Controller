"""Read-only live checks; writes only an owned verification report."""
import asyncio,json,os,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
cfg=json.loads((root/'.state/packet-tracer/connection.json').read_text())
os.environ.update(PT_HOST='127.0.0.1',PT_APP_ID=cfg['appId'],PT_APP_KEY=cfg['key'],PT_API_SPEC='8.2.0',PT_TIMEOUT='10',PT_MCP_ENABLE_RAW_IPC='false',PT_ALLOW_UNVERIFIED_IPC='false')
async def main():
 from fastmcp import Client
 from pt_mcp.server import server_mcp
 results=[]
 async with Client(server_mcp) as client:
  async def check(name,args,validate):
   try:
    r=await client.call_tool(name,args)
    try:value=json.loads(r.content[0].text)
    except json.JSONDecodeError:value=r.content[0].text
    validate(value)
    results.append({'tool':name,'status':'PASS'})
    return value
   except Exception as e:results.append({'tool':name,'status':'FAIL','error':str(e)[:300]});return None
  def require(value):
   if not value:raise AssertionError('Missing expected actual data')
  before=await check('get_pt_information',{},lambda x:require(x['pt_version'].startswith('8.2.2')))
  devices=await check('get_devices_in_network',{},lambda x:require(len(x)>0))
  switches=[x['name'] for x in devices or [] if x['type']=='switch']
  if switches:
   name=switches[0]
   await check('get_interfaces_for_device',{'name':name},lambda x:require(len(x)>0))
   await check('get_device_configuration',{'name':name},lambda x:require(x))
   await check('get_console_log',{'name':name},lambda x:require(x))
   await check('send_terminal_command',{'name':name,'command':'show clock'},lambda x:require(x['completed'] and 'UTC' in x['output']))
   await check('send_cli_command',{'name':name,'commands':'show ip interface brief'},lambda x:require(x[0]['status']=='ok'))
  await check('get_all_links',{},lambda x:require(len(x)>0))
  await check('get_device_models',{'device_type':'switch'},lambda x:require(x))
  await check('get_annotations',{},lambda x:require(isinstance(x,(dict,list))))
  after=await check('get_pt_information',{},lambda x:require(x['device_count']==before['device_count'] and x['link_count']==before['link_count']))
 report={'scope':'Live reads and read-only CLI; no topology/configuration writes','results':results,'beforeCounts':{k:before[k] for k in ['device_count','link_count']},'afterCounts':{k:after[k] for k in ['device_count','link_count']} if after else None}
 out=root/'test-results/packet-tracer-live-report.json';out.write_text(json.dumps(report,indent=2));print(json.dumps(report))
asyncio.run(main())
