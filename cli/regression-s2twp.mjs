// Node 20+; no npm dependencies for the DLL check. Browser checks need Playwright.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'cli/bin/Release/net10.0/opencc-net.dll');
const sourceDll = path.join(root, 'lib/OpenccNetLib.dll');
const input = '支持';
const expected = '支持';
let failed = false;

function dotnet(args, options = {}) {
    const result = spawnSync('dotnet', args, { cwd: root, encoding: 'utf8', ...options });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
}

async function sha256(file) {
    return createHash('sha256').update(await readFile(file)).digest('hex');
}

function report(label, actual) {
    console.log(`${actual === expected ? 'PASS' : 'FAIL'} ${label}: s2twp ${JSON.stringify(input)} -> ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
    if (actual !== expected) failed = true;
    return actual === expected;
}

async function checkBrowser(browser, label, url) {
    // A new context has no existing HTTP/Blazor caches. Also block service workers
    // and disable Chromium's network cache so this cannot reuse the user's old WASM.
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    const network = await context.newCDPSession(page);
    await network.send('Network.enable');
    await network.send('Network.setCacheDisabled', { cacheDisabled: true });
    const assets = new Set();
    page.on('response', response => {
        if (new URL(response.url()).pathname.includes('/_framework/')) assets.add(response.url());
    });
    try {
        const freshUrl = new URL(url);
        freshUrl.searchParams.set('regression', Date.now().toString());
        await page.goto(freshUrl.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForFunction(() => {
            try { return typeof window.openccDemo?.getInputText() === 'string'; }
            catch { return false; }
        });
        await page.locator('#config').selectOption('s2twp');
        await page.waitForFunction(() => document.querySelector('.status')?.textContent.includes('Current config set to: s2twp'));
        await page.locator('input[type=checkbox]').first().uncheck();
        await page.evaluate(text => {
            window.openccDemo.setInputText(text);
            window.openccDemo.setOutputText('');
        }, input);
        await page.getByRole('button', { name: 'Convert', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.status')?.textContent.includes('Config: s2twp'));
        const actual = await page.evaluate(() => window.openccDemo.getOutputText());
        const passed = report(label, actual);
        console.log(`  URL: ${freshUrl.href}`);
        for (const asset of assets) {
            if (/OpenccNetLib\.|dotnet\.native\./.test(asset)) console.log(`  Loaded: ${asset}`);
        }
        return passed;
    } finally {
        await context.close();
    }
}

async function serve(directory) {
    const base = path.resolve(directory);
    assert.ok((await stat(base)).isDirectory(), `Not a directory: ${base}`);
    const server = createServer(async (req, res) => {
        try {
            const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            const file = path.resolve(base, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
            const relative = path.relative(base, file);
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
                res.writeHead(403).end();
                return;
            }
            const contentType = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.json': 'application/json',
                '.html': 'text/html', '.css': 'text/css', '.dat': 'application/octet-stream' }[path.extname(file)] ?? 'application/octet-stream';
            const bytes = await readFile(file);
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
            res.end(bytes);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}

async function main() {
    const options = {};
    for (let i = 2; i < process.argv.length; i++) {
        const key = process.argv[i];
        assert.ok(['--url', '--published', '--browser-channel'].includes(key) && process.argv[i + 1],
            'Usage: node cli/regression-s2twp.mjs [--published <publish/wwwroot>] [--url <demo URL>] [--browser-channel chrome|msedge]');
        options[key] = process.argv[++i];
    }
    // Rebuild, then prove the CLI executes a byte-identical copy of lib/OpenccNetLib.dll.
    dotnet(['build', 'cli/OpenccNetCli.csproj', '-c', 'Release', '--nologo']);
    const sourceHash = await sha256(sourceDll);
    const loadedHash = await sha256(path.join(path.dirname(cli), 'OpenccNetLib.dll'));
    assert.equal(loadedHash, sourceHash, 'CLI output DLL differs from lib/OpenccNetLib.dll');
    console.log(`Source DLL SHA-256: ${sourceHash}`);
    const dllPassed = report('current DLL (fresh CLI build)', dotnet([cli, 'convert', '-c', 's2twp'], { input }));
    if (!dllPassed) console.log('DIAGNOSIS: The current source DLL still has the old/regressed behavior; browser caching cannot explain this native result.');

    if (!options['--published'] && !options['--url']) {
        console.log('Browser not checked. Add --published <wwwroot> and/or --url <demo URL> to distinguish stale published assets from an existing browser cache.');
        return;
    }
    const require = createRequire(import.meta.url);
    let chromium;
    try { ({ chromium } = require('playwright')); }
    catch { throw new Error('Browser checks require Playwright: npm install --no-save --package-lock=false --prefix cli playwright && npx --prefix cli playwright install chromium'); }
    const browser = await chromium.launch({ headless: true, channel: options['--browser-channel'] });
    try {
        if (options['--published']) {
            const server = await serve(options['--published']);
            try {
                const passed = await checkBrowser(browser, 'local published WASM (fresh browser)', server.url);
                if (dllPassed && !passed) console.log('DIAGNOSIS: Source DLL is updated, but the local published WASM still has old behavior. Rebuild/publish the browser app.');
            } finally { await server.close(); }
        }
        if (options['--url']) {
            const passed = await checkBrowser(browser, 'served WASM (fresh browser)', options['--url']);
            if (dllPassed && !passed) console.log('DIAGNOSIS: Source DLL is updated, but the server/CDN serves old behavior even to a fresh browser. Redeploy updated assets; this is not solely an existing browser cache.');
            if (dllPassed && passed) console.log('DIAGNOSIS: Source DLL and freshly fetched demo both return 支持. If an already-open browser returns 支援, its loaded assets/state are stale. Reload that tab and clear its site cache if needed.');
        }
    } finally { await browser.close(); }
}

try { await main(); }
catch (error) { console.error(`ERROR: ${error.stack ?? error}`); failed = true; }
process.exitCode = failed ? 1 : 0;
