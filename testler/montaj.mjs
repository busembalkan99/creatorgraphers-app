import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [, , desen, cikti, kol = '5'] = process.argv;
const fsn = fs.readdirSync('/tmp/cgapp/ss').filter(f => new RegExp(desen).test(f)).sort();
const html = `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(${kol},390px);gap:6px">${fsn.map(f => `<div><div style="font:12px sans-serif">${f}</div><img style="width:390px" src="data:image/png;base64,${fs.readFileSync('/tmp/cgapp/ss/' + f).toString('base64')}"></div>`).join('')}</body>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2000, height: 800 } });
await p.setContent(html); await p.screenshot({ path: cikti, fullPage: true }); await b.close();
