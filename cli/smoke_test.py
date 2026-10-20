"""Integration checks: build the Release CLI first; Python standard library only."""
import pathlib
import subprocess
import tempfile
import zipfile

CLI = pathlib.Path(__file__).resolve().parent / "bin/Release/net10.0/opencc-net.dll"


def run(*args, data=b"", ok=True):
    result = subprocess.run(["dotnet", str(CLI), *map(str, args)], input=data, capture_output=True)
    assert result.returncode == (0 if ok else 1), result.stderr.decode("utf-8", errors="replace")
    if not ok:
        assert result.stderr.startswith(b"Error:"), result.stderr
        assert not result.stdout
    return result.stdout


assert b"office" in run("--help")
assert run("convert", data="汉语".encode()).decode() == "漢語"
assert run("convert", "-c", "t2s", data="漢語".encode()).decode() == "汉语"
assert run("convert", "--keep-ids", "-c", "t2s", data="⿰氵漢".encode()).decode() == "⿰氵漢"
assert run("convert", "--out-enc", "utf16le", data="汉语".encode()) == "漢語".encode("utf-16le")
assert run("convert", "--in-enc", "gbk", data="汉语".encode("gb18030")).decode() == "漢語"
assert run("convert", "--out-enc", "big5", data="汉语".encode()) == "漢語".encode("big5")
assert run("convert", "-E", "--detofu", "ext-c", data="⽟".encode()).decode() == "玉"
for args, data in [(("convert", "--bad"), b""), (("convert", "-i"), b""),
                   (("convert", "-c", "bad"), b""), (("convert", "--detofu", "ext-z"), b""),
                   (("convert", "--out-enc", "ascii"), "汉".encode()),
                   (("convert",), b"\xff"), (("office",), b"")]:
    run(*args, data=data, ok=False)

with tempfile.TemporaryDirectory(dir=CLI.parent) as folder:
    root = pathlib.Path(folder)
    source = root / "input.txt"
    source.write_text("汉语", encoding="utf-8")
    target = root / "output.txt"
    run("convert", "-i", source, "-o", target, "--out-enc", "utf16le")
    assert target.read_bytes() == "漢語".encode("utf-16le")
    run("convert", "-i", source, "-o", source, ok=False)
    assert source.read_text(encoding="utf-8") == "汉语"
    dictionary = root / "custom.txt"
    dictionary.write_text("汉语\t測試\n", encoding="utf-8")
    assert run("convert", "-D", f"stphrases:append:{dictionary}", data="汉语".encode()).decode() == "測試"
    run("convert", "-D", f"stphrases:append:{root / 'missing.txt'}", data=b"test", ok=False)

    # Exercise each archive format with its actual selected text-entry path.
    for extension, entry, xml in [
        ("docx", "word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>汉语</w:t></w:r></w:p></w:body></w:document>'),
        ("xlsx", "xl/sharedStrings.xml", '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>汉语</t></si></sst>'),
        ("pptx", "ppt/slides/slide1.xml", '<a:t xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">汉语</a:t>'),
        *[(ext, "content.xml", '<text:p xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">汉语</text:p>') for ext in ("odt", "ods", "odp")],
        ("epub", "OEBPS/chapter.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>汉语</p></body></html>'),
    ]:
        document = root / f"汉语.{extension}"
        with zipfile.ZipFile(document, "w") as archive:
            if extension == "epub":
                archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
            archive.writestr(entry, xml)
            archive.writestr("unchanged.bin", b"\x00\xff")
        run("office", "-i", document, "-F")
        converted = root / f"漢語_converted.{extension}"
        with zipfile.ZipFile(converted) as archive:
            assert "漢語" in archive.read(entry).decode(), extension
            assert archive.read("unchanged.bin") == b"\x00\xff"
        explicit = root / f"explicit-{extension}"
        run("office", "-i", document, "-o", explicit, "-f", extension)
        assert explicit.with_suffix(f".{extension}").exists()
        run("office", "-i", document, "-o", document, ok=False)

print("CLI integration checks passed.")
