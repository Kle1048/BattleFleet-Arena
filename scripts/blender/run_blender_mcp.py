"""Execute a checked-in asset script through the local official Blender MCP bridge."""
import asyncio
import json
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    code = Path(sys.argv[1]).read_text(encoding="utf-8")
    async with stdio_client(StdioServerParameters(command=sys.executable, args=["-m", "blmcp"])) as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            response = await session.call_tool("execute_blender_code", {"code": code})
            for content in response.content:
                if hasattr(content, "text"):
                    print(content.text)
                    data = json.loads(content.text)
                    if data.get("status") == "error":
                        raise RuntimeError(data.get("message"))
            if response.isError:
                raise RuntimeError("MCP tool returned an error")


if __name__ == "__main__":
    asyncio.run(main())
