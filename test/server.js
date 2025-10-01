import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const PORT = process.env.PORT || 5173

const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.svg': 'image/svg+xml',
}

const send = (res, code, body, headers = {}) => {
	res.writeHead(code, headers)
	res.end(body)
}

const server = http.createServer((req, res) => {
	try {
		let url = decodeURIComponent(req.url || '/')
		if (url === '/' || url === '') url = '/test/site/index.html'
		const abs = path.join(root, url)
		if (!abs.startsWith(root)) return send(res, 403, 'Forbidden')
		if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
			const ext = path.extname(abs)
			const type = mime[ext] || 'application/octet-stream'
			res.writeHead(200, { 'content-type': type })
			fs.createReadStream(abs).pipe(res)
			return
		}
		send(res, 404, 'Not Found')
	} catch (e) {
		send(res, 500, (e && e.stack) || String(e))
	}
})

server.listen(PORT, () => {
	console.log(`Test server listening on http://localhost:${PORT}`)
})
