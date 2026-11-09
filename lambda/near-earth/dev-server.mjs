// Runs the near-earth Lambda on this machine, so the page can be developed without AWS:
//
//   node lambda/near-earth/dev-server.mjs
//
// Vite proxies /api/near-earth to port 8787. Listens on localhost only.

import { createServer } from 'node:http'
import { handler } from './index.mjs'

const PORT = Number(process.env.PORT ?? 8787)

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  const result = await handler({ rawPath: pathname, requestContext: { http: { method: req.method } } })
  res.writeHead(result.statusCode, result.headers)
  res.end(result.body)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`near-earth API on http://localhost:${PORT}`)
})
