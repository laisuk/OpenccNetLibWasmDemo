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

## GitHub Pages

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
