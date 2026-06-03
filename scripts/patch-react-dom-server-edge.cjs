const fs = require('node:fs');
const path = require('node:path');

const packagePath = path.join(process.cwd(), 'node_modules', 'react-dom', 'package.json');
const serverEdgePath = path.join(process.cwd(), 'node_modules', 'react-dom', 'server.edge.js');

if (!fs.existsSync(packagePath)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

pkg.exports = pkg.exports || {};
pkg.exports['./server.edge'] = './server.edge.js';

fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

if (!fs.existsSync(serverEdgePath)) {
  fs.writeFileSync(serverEdgePath, "module.exports = require('./server.browser');\n");
}

console.log('Patched react-dom/server.edge for Next 13 dev runtime compatibility.');
