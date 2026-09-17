import { createServer } from 'vite'
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
console.log(JSON.stringify(m.resolveOntology('باب زجاجي سحاب'), null, 1).slice(0, 1600))
await server.close()
