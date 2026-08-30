CodeMirror refactor for the OpenccNetLib Blazor WASM live demo.

Replace:
- your page component with Home.razor (or rename it to Index.razor)
- the scoped CSS with Home.razor.css
- wwwroot/demoInterop.js with the new demoInterop.js

Load demoInterop.js from wwwroot/index.html before </body>:

    <script src="demoInterop.js"></script>

No CodeMirror <script> tags are required. demoInterop.js dynamically imports:
- @codemirror/state
- @codemirror/view
- @codemirror/commands
from esm.sh.

Important architectural change:
Large input/output strings are no longer stored as Blazor component state.
CodeMirror owns both documents. C# only transfers text across JS interop when
opening/decoding a file, normalizing, converting, copying, or clearing.

This avoids Blazor re-rendering a multi-megabyte textarea on every component
render and preserves the large-text behavior of the original static WASM demo.
