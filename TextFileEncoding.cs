using System.Text;

namespace OpenccNetLibWasmDemo;

// Uses the same C# detector and confidence thresholds as the Rust demo JS port.
public static class TextFileEncoding
{
    public static string Detect(byte[] bytes)
    {
        var result = CjkEncodingDetector.Detect(bytes);

        if (!result.Detected)
            throw new InvalidOperationException("Unable to detect text encoding. Disable auto-detection and select an encoding manually.");

        return result.Encoding switch
        {
            CjkEncodingDetector.EncodingKind.Utf16Le or
                CjkEncodingDetector.EncodingKind.Utf16LeBom
                => "utf-16le",

            CjkEncodingDetector.EncodingKind.Utf16Be or
                CjkEncodingDetector.EncodingKind.Utf16BeBom
                => "utf-16be",

            CjkEncodingDetector.EncodingKind.Big5
                => "big5",

            CjkEncodingDetector.EncodingKind.Gb18030
                => "gb18030",

            CjkEncodingDetector.EncodingKind.ShiftJis
                => "shift_jis",

            // ASCII and UTF-8 (with or without BOM).
            _ => "utf-8"
        };
    }

    public static Encoding Resolve(string name)
    {
        return name.ToLowerInvariant() switch
        {
            "utf-8" => new UTF8Encoding(false, true),
            "utf-16le" => new UnicodeEncoding(false, false, true),
            "utf-16be" => new UnicodeEncoding(true, false, true),
            "gb18030" => Encoding.GetEncoding("GB18030", EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback),
            "big5" => Encoding.GetEncoding("Big5", EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback),
            "shift_jis" => Encoding.GetEncoding("shift_jis", EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback),
            _ => throw new ArgumentException(
                $"Unsupported encoding: {name}")
        };
    }

    public static string Decode(byte[] bytes, bool automatic, string manualEncoding)
    {
        var text = Resolve(automatic ? Detect(bytes) : manualEncoding).GetString(bytes);
        return text.StartsWith('\uFEFF') ? text[1..] : text;
    }
}
