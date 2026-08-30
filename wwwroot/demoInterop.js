window.openccDemo = (() => {
    let editorLeft = null;
    let editorRight = null;
    let openedTextChangedCallback = null;
    let addToHistoryAnnotation = null;

    async function ensureCodeMirror() {
        const [
            stateModule,
            viewModule,
            commandsModule
        ] = await Promise.all([
            import("https://esm.sh/@codemirror/state"),
            import("https://esm.sh/@codemirror/view"),
            import("https://esm.sh/@codemirror/commands")
        ]);

        return {
            EditorState: stateModule.EditorState,
            Transaction: stateModule.Transaction,
            EditorView: viewModule.EditorView,
            keymap: viewModule.keymap,
            lineNumbers: viewModule.lineNumbers,
            defaultKeymap: commandsModule.defaultKeymap,
            history: commandsModule.history,
            historyKeymap: commandsModule.historyKeymap
        };
    }

    async function initializeEditors(leftId, rightId, initialText) {
        if (editorLeft && editorRight) {
            return;
        }

        const {
            EditorState,
            Transaction,
            EditorView,
            keymap,
            lineNumbers,
            defaultKeymap,
            history,
            historyKeymap
        } = await ensureCodeMirror();

        addToHistoryAnnotation = Transaction.addToHistory;

        function createEditor(parent, text, readOnly, onDocChanged = null) {
            const extensions = [
                lineNumbers(),
                history(),
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap
                ]),
                EditorView.lineWrapping,
                EditorView.editable.of(!readOnly),
                EditorState.readOnly.of(readOnly)
            ];

            if (onDocChanged) {
                extensions.push(
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) {
                            onDocChanged();
                        }
                    })
                );
            }

            return new EditorView({
                parent,
                state: EditorState.create({
                    doc: text ?? "",
                    extensions
                })
            });
        }

        const leftHost = document.getElementById(leftId);
        const rightHost = document.getElementById(rightId);

        if (!leftHost || !rightHost) {
            throw new Error("CodeMirror editor host element not found.");
        }

        editorLeft = createEditor(
            leftHost,
            initialText ?? "",
            false,
            () => {
                if (openedTextChangedCallback) {
                    openedTextChangedCallback();
                }
            });

        editorRight = createEditor(
            rightHost,
            "",
            true
        );

    }

    function requireEditor(editor, name) {
        if (!editor) {
            throw new Error(`${name} is not initialized.`);
        }

        return editor;
    }

    function getEditorText(editor) {
        return editor.state.doc.toString();
    }

    function setEditorText(editor, text, addToHistory = true) {
        editor.dispatch({
            changes: {
                from: 0,
                to: editor.state.doc.length,
                insert: text ?? ""
            },
            annotations: addToHistoryAnnotation.of(addToHistory)
        });
    }

    return {
        initializeEditors,

        setInputChangedCallback: function (dotNetRef, methodName) {
            if (!dotNetRef || !methodName) {
                openedTextChangedCallback = null;
                return;
            }

            openedTextChangedCallback = () => {
                void dotNetRef.invokeMethodAsync(methodName);
            };
        },

        clearInputChangedCallback: function () {
            openedTextChangedCallback = null;
        },

        getInputText: function () {
            return getEditorText(requireEditor(editorLeft, "Input editor"));
        },

        getOutputText: function () {
            return getEditorText(requireEditor(editorRight, "Output editor"));
        },

        setInputText: function (text) {
            setEditorText(requireEditor(editorLeft, "Input editor"), text);
        },

        setOutputText: function (text) {
            setEditorText(
                requireEditor(editorRight, "Output editor"),
                text,
                false);
        },

        clearInput: function () {
            setEditorText(requireEditor(editorLeft, "Input editor"), "");
        },

        clearOutput: function () {
            setEditorText(
                requireEditor(editorRight, "Output editor"),
                "",
                false);
        },

        focusInput: function () {
            requireEditor(editorLeft, "Input editor").focus();
        },

        focusOutput: function () {
            requireEditor(editorRight, "Output editor").focus();
        },

        pasteToInput: async function () {
            const text = await navigator.clipboard.readText();
            setEditorText(requireEditor(editorLeft, "Input editor"), text);
        },

        copyOutput: async function () {
            const text = getEditorText(requireEditor(editorRight, "Output editor"));
            await navigator.clipboard.writeText(text);
        },

        nextFrame: function () {
            return new Promise(resolve => requestAnimationFrame(() => resolve()));
        },

        downloadBytes: function (fileName, contentType, bytes) {
            const blob = new Blob(
                [bytes],
                { type: contentType || "application/octet-stream" });

            const url = URL.createObjectURL(blob);

            try {
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = fileName || "download";
                anchor.style.display = "none";

                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
            } finally {
                setTimeout(() => URL.revokeObjectURL(url), 0);
            }
        }
    };
})();
