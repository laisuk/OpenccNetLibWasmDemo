# OpenccNetLib WASM Demo

A browser-based live demo for **OpenccNetLib**, running entirely client-side with Blazor WebAssembly.

The demo supports high-performance Simplified/Traditional Chinese conversion, punctuation conversion, Unicode
compatibility normalization, and local document conversion for DOCX, XLSX, PPTX, EPUB, and text files.

**Nothing is uploaded.** Text and documents are processed locally in your browser.

## Live Demo

**https://laisuk.github.io/OpenccNetLibWasmDemo/**

> The public demo is published as a WebAssembly AOT build for
> substantially better conversion performance.

## Features

- OpenccNetLib Simplified/Traditional Chinese conversion
- All supported OpenccNetLib conversion configurations
- Optional punctuation conversion
- Unicode compatibility normalization
- Extended Unicode compatibility normalization
- CJK language detection
- Large-text editing with CodeMirror
- Local text-file decoding with selectable encodings
- DOCX, XLSX, PPTX, EPUB, and TXT conversion
- Converted document download
- Browser-local processing with no server upload
- Static-site compatible
- WebAssembly AOT deployment

## Performance

The GitHub Pages demo uses **WebAssembly AOT compilation**.

On a 13th Gen Intel Core i5-13400, representative browser measurements include:

``` text
t2s, 1,108,590 characters
76.90 ms
14.42M chars/sec

t2s + punctuation, 2,270,784 characters
197.70 ms
11.49M chars/sec
```

A roughly 500K-character EPUB converted from Traditional to Simplified Chinese in about **83.6 ms** in the same AOT
build.

These are browser-side measurements from the live Blazor WebAssembly conversion path. Actual performance varies by
browser, CPU, input text, conversion configuration, and whether the relevant conversion plan has already been
initialized.

## Architecture

The application is a static Blazor WebAssembly site. OpenccNetLib and the document converters execute locally in the
browser.

Large input and output strings are owned by CodeMirror rather than Blazor component state. C# transfers text across JS
interop only when an operation requires it, such as opening or decoding a file, normalization, conversion, copying, or
clearing.

This avoids re-rendering multi-megabyte editor content through the Blazor render tree and keeps large-text interaction
responsive.

CodeMirror is loaded through ES modules by `wwwroot/demoInterop.js`.

## Development

Requirements:

- .NET 10 SDK
- OpenccNetLib 1.7.0 or later

Run locally:

``` powershell
dotnet run
```

For meaningful WebAssembly performance testing, use a published Release build rather than the development server.

Normal Release publish:

``` powershell
dotnet publish -c Release
```

WebAssembly AOT publish:

``` powershell
dotnet workload install wasm-tools
dotnet publish -c Release -p:RunAOTCompilation=true
```

The static site is generated under:

``` text
bin/Release/net10.0/publish/wwwroot/
```

## Local CLI

The separate .NET 10 console project in `cli/` uses the same bundled library.
It is excluded from the Blazor build and published web assets. The existing
GitHub Pages/AOT workflow remains unchanged.

``` powershell
dotnet build cli/OpenccNetCli.csproj -c Release
dotnet cli/bin/Release/net10.0/opencc-net.dll --help
dotnet cli/bin/Release/net10.0/opencc-net.dll convert -i input.txt -o output.txt -c s2tw -p
dotnet cli/bin/Release/net10.0/opencc-net.dll office -i 软件手册.docx -c s2t --convert-filename
```

For a directly runnable local executable (requires the .NET 10 runtime):

``` powershell
dotnet publish cli/OpenccNetCli.csproj -c Release -o cli/bin/local
./cli/bin/local/opencc-net.exe convert -i input.txt -o output.txt -c t2s
```

`convert` reads stdin when `-i` is omitted and writes stdout when `-o` is omitted.
For pipelines, invoke the built executable or DLL directly to avoid build messages
in stdout. Diagnostics go to stderr; success exits with 0 and errors with 1.
Input and output must have different paths. Existing output files are replaced.

Options mirror the reference JavaScript CLI: punctuation, IDS preservation,
compatibility normalization, detofu thresholds, repeatable custom dictionaries,
Office format selection, font preservation, and generated filename conversion.
Extended normalization takes priority over basic normalization; the pipeline is
normalization, conversion, then detofu. Custom dictionaries use
`-D slot:append:dictionary.txt` or `-D slot:override:dictionary.txt`.

Both `--in-enc` and `--out-enc` accept UTF-8 (default), UTF-16LE, Latin-1,
ASCII, GB18030, GBK/GB2312 (mapped to GB18030), Big5, and Shift-JIS; see
`--help` for spellings. Output encoding applies to files **and stdout**, without
a BOM. Invalid byte sequences and characters unavailable in the output encoding
are errors. Office/EPUB packages handle their own internal encodings.

Office conversion supports DOCX, XLSX, PPTX, ODT, ODS, ODP, and EPUB. When output
is omitted it uses `<input-stem>_converted.<format>` beside the input; `-F`
converts that generated stem. An explicit output name without an extension gains
the selected format extension. Fonts are preserved unless `--no-keep-font` is set.

Run the CLI integration checks after building with:

``` powershell
python cli/smoke_test.py
```

### `s2twp` DLL / browser-cache regression

This Node.js check asserts that `支持` with `s2twp` returns `支持` rather than
the previous `支援`. It rebuilds the CLI and checks that its copied library has
the same SHA-256 as `lib/OpenccNetLib.dll` before executing the conversion:

``` powershell
node cli/regression-s2twp.mjs
```

No npm packages are needed for that check. A failure here means the repository
DLL itself still has old/regressed conversion behavior, independent of browser
caching. The check reports the DLL hash and exits with 1 on failure (0 on success).

To also execute the actual Blazor conversion in a fresh browser, install Playwright
locally under the excluded CLI folder. Use installed Edge with `--browser-channel
msedge` (or Chrome with `--browser-channel chrome`):

``` powershell
npm install --no-save --package-lock=false --prefix cli playwright
node cli/regression-s2twp.mjs --published bin/Release/net10.0/publish/wwwroot --browser-channel msedge
node cli/regression-s2twp.mjs --url https://laisuk.github.io/OpenccNetLibWasmDemo/ --browser-channel msedge
```

Alternatively, install Playwright's Chromium using `npx --prefix cli playwright
install chromium` and omit `--browser-channel`. Node.js 20+, .NET 10, and access to
the demo's external CodeMirror modules are required. `--published` tests existing
publish output without rebuilding it, using a temporary localhost server;
`--url` tests an already running local or deployed demo. Both can be used together.
Browser runs use isolated contexts, block service workers, disable the HTTP cache,
and report loaded library/runtime asset URLs. They do not clear your normal browser.

Interpret results:

| DLL | Fresh WASM | Meaning |
| --- | --- | --- |
| `支援` | Any | Source DLL still has old/regressed behavior; update the library first. |
| `支持` | Local publish returns `支援` | Local WASM publish is stale; rebuild/publish. |
| `支持` | Demo URL returns `支援` | Server/CDN serves old behavior; redeploy/check hosting caches. |
| `支持` | Demo URL returns `支持` | Current served build passes. An older open tab returning `支援` has stale loaded assets/state. |

These checks diagnose behavior rather than claiming a version number uniquely
identifies the library. A fresh-browser failure cannot be attributed solely to an
existing user's browser cache. The tests and optional npm packages are excluded
from the browser build; the deployment workflow is unchanged.

## GitHub Pages deployment

The public demo is built and deployed by GitHub Actions. Generated AOT publish output is uploaded directly as a GitHub
Pages artifact and is **not committed to the repository**.

This keeps large generated WebAssembly binaries out of Git history while still serving the optimized AOT build to users.

## CodeMirror integration

No CodeMirror `<script>` tags are required in `wwwroot/index.html`.

Load the demo interop script before `</body>`:

``` html
<script src="demoInterop.js"></script>
```

`demoInterop.js` dynamically imports the required CodeMirror modules from esm.sh.

## OpenccNetLib

This repository is a live browser demo for OpenccNetLib. The library itself is distributed separately through NuGet.
