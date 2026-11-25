"""Project-owned JSON bridge. Never listen on a network interface."""
import asyncio
import json
import os
import sys
from pathlib import Path

private_config = Path(__file__).resolve().parent.parent / '.state' / 'packet-tracer' / 'connection.json'
if private_config.exists():
    connection = json.loads(private_config.read_text())
    os.environ['PT_APP_ID'] = connection['appId']
    os.environ['PT_APP_KEY'] = connection['key']

os.environ['PT_HOST'] = '127.0.0.1'
os.environ['PT_MCP_ENABLE_RAW_IPC'] = 'false'
os.environ['PT_ALLOW_UNVERIFIED_IPC'] = 'false'
os.environ['PT_TIMEOUT'] = '10'
os.environ['PT_API_SPEC'] = '8.2.0'

async def main():
    from fastmcp import Client
    from pt_mcp.server import server_mcp
    async with Client(server_mcp) as client:
        if len(sys.argv) == 2 and sys.argv[1] == '--catalog':
            print(json.dumps([t.model_dump(mode='json') for t in await client.list_tools()]))
            return
        request = json.loads(sys.stdin.readline())
        # Host approval is mandatory for all calls whose upstream annotation is
        # not explicitly read-only. Python cannot silently authorize mutations.
        catalog = {t.name: t for t in await client.list_tools()}
        tool = catalog[request['tool']]
        if not (tool.annotations and tool.annotations.readOnlyHint is True) and request.get('approved') is not True:
            raise PermissionError('PACKET_TRACER_APPROVAL_REQUIRED')
        result = await client.call_tool(request['tool'], request.get('arguments', {}))
        print(json.dumps({'content': [c.model_dump(mode='json') for c in result.content]}, default=str))

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
