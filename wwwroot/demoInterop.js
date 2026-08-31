window.openccDemo = (() => {
    let editorLeft = null;
    let editorRight = null;
    let preservedInputText = null;
    let preservedOutputText = null;
    let openedTextChangedCallback = null;
    let addToHistoryAnnotation = null;

    let preservedOfficeInputName = "";
    let preservedDownloadBlob = null;
    let preservedDownloadUrl = null;
    let preservedDownloadName = "";
    let preservedDownloadContentType = "";


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
        if (editorLeft && editorRight &&
            editorLeft.dom.isConnected &&
            editorRight.dom.isConnected) {
            return;
        }

        if (editorLeft) {
            preservedInputText = editorLeft.state.doc.toString();
            editorLeft.destroy();
            editorLeft = null;
        }

        if (editorRight) {
            preservedOutputText = editorRight.state.doc.toString();
            editorRight.destroy();
            editorRight = null;
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
            preservedInputText ?? initialText ?? "",
            false,
            () => {
                if (openedTextChangedCallback) {
                    openedTextChangedCallback();
                }
            });

        editorRight = createEditor(
            rightHost,
            preservedOutputText ?? "",
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

        clearPreservedEditorText: function () {
            preservedInputText = null;
            preservedOutputText = null;
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
                {type: contentType || "application/octet-stream"});

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
        },

        preserveOfficeResult: function (
            inputName,
            outputName,
            contentType,
            bytes) {

            if (preservedDownloadUrl) {
                URL.revokeObjectURL(preservedDownloadUrl);
            }

            preservedOfficeInputName = inputName || "";
            preservedDownloadName = outputName || "converted";
            preservedDownloadContentType =
                contentType || "application/octet-stream";

            preservedDownloadBlob = new Blob(
                [bytes],
                {type: preservedDownloadContentType});

            preservedDownloadUrl =
                URL.createObjectURL(preservedDownloadBlob);
        },

        getPreservedOfficeState: function () {
            if (!preservedDownloadBlob) {
                return null;
            }

            return {
                inputName: preservedOfficeInputName,
                outputName: preservedDownloadName,
                contentType: preservedDownloadContentType,
            };
        },

        downloadPreservedOfficeResult: function () {
            if (!preservedDownloadUrl || !preservedDownloadBlob) {
                return false;
            }

            const anchor = document.createElement("a");
            anchor.href = preservedDownloadUrl;
            anchor.download = preservedDownloadName || "converted";
            anchor.style.display = "none";

            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            return true;
        },

        clearPreservedOfficeState: function () {
            preservedOfficeInputName = "";
            preservedDownloadBlob = null;
            preservedDownloadName = "";
            preservedDownloadContentType = "";

            if (preservedDownloadUrl) {
                URL.revokeObjectURL(preservedDownloadUrl);
                preservedDownloadUrl = null;
            }
        },

        initializeOfficeDrop: function (dropId, inputId) {
            const drop = document.getElementById(dropId);
            const input = document.getElementById(inputId);

            if (!drop || !input) {
                return;
            }

            drop.addEventListener("dragover", e => {
                e.preventDefault();
            });

            drop.addEventListener("drop", e => {
                e.preventDefault();

                const file = e.dataTransfer?.files?.[0];

                if (!file) {
                    return;
                }

                const transfer = new DataTransfer();
                transfer.items.add(file);

                input.files = transfer.files;
                input.dispatchEvent(
                    new Event("change", {bubbles: true}));
            });
        },
    };
})();
