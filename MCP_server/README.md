# MCP Server

## Helpful links

- SDK Github: https://github.com/modelcontextprotocol/typescript-sdk
- Server url: http://localhost:3000/mcp
- MCP inspector: https://modelcontextprotocol.io/docs/tools/inspector

Docker setup:

```
docker pull ghcr.io/mcuf-idim/hapi-hackathon:latest && \
docker run -d -p 8080:8080 --name hapi-fhir ghcr.io/mcuf-idim/hapi-hackathon:latest
```