using System.Text;
using OpenccNetLib;

return Cli.Run(args);

internal static class Cli
{
    public static int Run(string[] args)
    {
        try
        {
            if (args.Length == 0 || args.Contains("--help") || args.Contains("-h"))
            {
                Help();
                return 0;
            }

            var office = args[0] == "office";
            if (!office && args[0] != "convert")
                throw new ArgumentException($"Unknown command: {args[0]}");
            var options = new Dictionary<string, string>();
            var dicts = new List<CustomDictSpec>();
            for (var i = 1; i < args.Length; i++)
            {
                var key = args[i] switch
                {
                    "-i" => "--input", "-o" => "--output", "-c" => "--config",
                    "-p" => "--punct", "-n" => "--norm-compat", "-E" => "--norm-compat-extended",
                    "-D" => "--custom-dict", "-f" => "--format", "-F" => "--convert-filename",
                    var other => other
                };
                string value;
                switch (key)
                {
                    case "--punct": case "--keep-ids": case "--norm-compat": case "--norm-compat-extended":
                        value = "true";
                        break;
                    case "--keep-font": case "--no-keep-font": case "--convert-filename":
                        if (!office) throw new ArgumentException($"{key} is only valid for office.");
                        value = "true";
                        break;
                    case "--detofu":
                        value = i + 1 < args.Length && !args[i + 1].StartsWith('-') ? args[++i] : "all";
                        break;
                    case "--input": case "--output": case "--config": case "--custom-dict":
                    case "--format": case "--in-enc": case "--out-enc":
                        if ((key == "--format" && !office) || (office && key is ("--in-enc" or "--out-enc")))
                            throw new ArgumentException($"Option {key} is not valid for this command.");
                        if (++i >= args.Length || args[i].StartsWith('-'))
                            throw new ArgumentException($"Missing value for {key}.");
                        value = args[i];
                        break;
                    default: throw new ArgumentException($"Unknown option: {key}");
                }
                if (key == "--custom-dict") dicts.Add(CustomDictSpec.Parse(value));
                else options[key] = value;
            }

            string? Get(string key) => options.GetValueOrDefault(key);
            bool Has(string key) => options.ContainsKey(key);
            var config = Get("--config") ?? "s2t";
            if (!Opencc.IsValidConfig(config)) throw new ArgumentException($"Invalid conversion config: {config}");
            var cc = new Opencc(config, customDictSpecs: dicts, isPreserveIds: Has("--keep-ids"));
            DeTofuLevel? detofu = Has("--detofu") ? ParseDetofu(Get("--detofu")!) : null;
            string Convert(string text)
            {
                if (Has("--norm-compat-extended")) text = cc.NormalizeCompatExtended(text);
                else if (Has("--norm-compat")) text = cc.NormalizeCompat(text);
                text = cc.Convert(text, Has("--punct"));
                return detofu is { } level ? cc.DeTofu(text, level) : text;
            }

            var input = Get("--input");
            var output = Get("--output");
            if (office)
            {
                if (input is null) throw new ArgumentException("Input file is missing.");
                var formatName = (Get("--format") ?? Path.GetExtension(input).TrimStart('.')).Trim().ToLowerInvariant();
                if (formatName is not ("docx" or "xlsx" or "pptx" or "odt" or "ods" or "odp" or "epub"))
                    throw new ArgumentException($"Invalid office format: {formatName}");
                if (output is null)
                {
                    var stem = Path.GetFileNameWithoutExtension(input);
                    if (Has("--convert-filename")) stem = Convert(stem);
                    if (stem.Length == 0 || stem.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || stem.Contains('/') || stem.Contains('\\'))
                        throw new ArgumentException("Converted filename is invalid. Specify --output explicitly.");
                    output = Path.Combine(Path.GetDirectoryName(input) ?? "", $"{stem}_converted.{formatName}");
                    Console.Error.WriteLine($"Output file not specified. Using: {output}");
                }
                else if (!Path.HasExtension(output)) output += $".{formatName}";
                DistinctPaths(input, output);
                OfficeDocConverter.ConvertOfficeFile(input, output, formatName, Convert, !Has("--no-keep-font"));
                Console.Error.WriteLine($"Conversion completed ({config}, {formatName}): {input} -> {output}");
            }
            else
            {
                DistinctPaths(input, output);
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
                var inEncoding = EncodingFor(Get("--in-enc") ?? "utf8");
                var outEncoding = EncodingFor(Get("--out-enc") ?? "utf8");
                if (input is null && !Console.IsInputRedirected)
                    Console.Error.WriteLine("Input text to convert, <Ctrl+Z>/<Ctrl+D> to submit:");
                using var source = input is null ? Console.OpenStandardInput() : File.OpenRead(input);
                // Respect the explicitly selected encoding; strip only its matching BOM.
                using var reader = new StreamReader(source, inEncoding, detectEncodingFromByteOrderMarks: false);
                var text = reader.ReadToEnd();
                if ((inEncoding.CodePage is 65001 or 1200) && text.StartsWith('\uFEFF')) text = text[1..];
                var bytes = outEncoding.GetBytes(Convert(text));
                using var target = output is null ? Console.OpenStandardOutput() : File.Create(output);
                target.Write(bytes);
                if (!Console.IsErrorRedirected)
                    Console.Error.WriteLine($"Conversion completed ({config}): {input ?? "<stdin>"} -> {output ?? "<stdout>"}");
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static void DistinctPaths(string? input, string? output)
    {
        if (input is not null && output is not null && string.Equals(Path.GetFullPath(input), Path.GetFullPath(output),
                OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
            throw new ArgumentException("Input and output files must be different.");
    }

    private static DeTofuLevel ParseDetofu(string value)
    {
        var name = value.Trim().ToLowerInvariant().Replace("-", "");
        if (name == "all") return DeTofuLevel.ExtB;
        if (name.StartsWith("ext")) name = name[3..];
        if (name.Length == 1 && name[0] is >= 'b' and <= 'i' &&
            Enum.TryParse<DeTofuLevel>("Ext" + name.ToUpperInvariant(), out var level)) return level;
        throw new ArgumentException($"Invalid detofu level: {value}. Use all or ext-b through ext-i.");
    }

    private static Encoding EncodingFor(string value)
    {
        var codePage = value.Trim().ToLowerInvariant() switch
        {
            "utf8" or "utf-8" => 65001, "utf16le" or "utf-16le" => 1200,
            "latin1" or "latin-1" => 28591, "ascii" => 20127,
            "gb18030" or "gbk" or "gb2312" => 54936, "big5" => 950,
            "shift_jis" or "shift-jis" => 932,
            _ => throw new ArgumentException($"Unsupported encoding: {value}")
        };
        return Encoding.GetEncoding(codePage, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
    }

    private static void Help() => Console.WriteLine("""
        OpenccNetLib local CLI

        Usage: opencc-net convert [options]
               opencc-net office  [options]

        Common options:
          -i, --input <file>           Input file (convert defaults to stdin)
          -o, --output <file>          Output file (convert defaults to stdout)
          -c, --config <name>          Conversion config (default: s2t)
          -p, --punct                  Convert punctuation
          --keep-ids                   Preserve complete IDS expressions
          -n, --norm-compat            Normalize compatibility ideographs first
          -E, --norm-compat-extended   Extended normalization (takes priority over -n)
          --detofu [level]             all (default), ext-b through ext-i
          -D, --custom-dict <spec>     slot:append|override:file; repeatable
          -h, --help                   Show help

        Convert options:
          --in-enc <encoding>          Input encoding (default: utf8)
          --out-enc <encoding>         File/stdout encoding (default: utf8; no BOM)
          Encodings: utf8, utf16le, latin1, ascii, gb18030, gbk, gb2312,
                     big5, shift_jis, shift-jis (same choices for input/output).
          Invalid input bytes or unrepresentable output characters are errors.

        Office options:
          -f, --format <format>        docx|xlsx|pptx|odt|ods|odp|epub; inferred from input
          -F, --convert-filename       Convert default output filename stem
          --keep-font                 Preserve fonts (default)
          --no-keep-font              Disable font preservation
          Default output: <input-stem>_converted.<format>

        Conversion configs:
        """ + Environment.NewLine + "  " + string.Join(", ", Opencc.GetSupportedConfigs()));
}
