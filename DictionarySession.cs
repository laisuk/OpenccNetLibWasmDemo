using OpenccNetLib;

namespace OpenccNetLibWasmDemo;

public sealed class DictionaryDraft
{
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public DictSlot Slot { get; set; } = DictSlot.STPhrases;
    public CustomDictMode Mode { get; set; }
    public string Entries { get; set; } = "";
}

public sealed class DictionarySession
{
    public Opencc BaseConverter { get; }
    public Opencc ActiveConverter { get; private set; }
    public int ActiveCount { get; private set; }

    public DictionarySession(Opencc converter) => BaseConverter = ActiveConverter = converter;

    public void Apply(IEnumerable<DictionaryDraft> drafts)
    {
        var specs = Parse(drafts);
        BaseConverter.SetConfig(ActiveConverter.GetConfig());
        BaseConverter.IsPreserveIds = ActiveConverter.IsPreserveIds;
        var candidate = specs.Length == 0 ? BaseConverter : BaseConverter.WithCustomDictionary(specs);
        ActiveConverter = candidate;
        ActiveCount = specs.Length;
    }

    public void Reset()
    {
        BaseConverter.SetConfig(ActiveConverter.GetConfig());
        BaseConverter.IsPreserveIds = ActiveConverter.IsPreserveIds;
        ActiveConverter = BaseConverter;
        ActiveCount = 0;
    }

    public static CustomDictSpec[] Parse(IEnumerable<DictionaryDraft> drafts)
    {
        var specs = new List<CustomDictSpec>();
        var seen = new HashSet<DictSlot>();
        foreach (var draft in drafts)
        {
            var prefix = $"Dictionary card {specs.Count + 1}";
            if (!draft.Slot.IsActive()) throw new ArgumentException($"{prefix}: unsupported slot.");
            if (!seen.Add(draft.Slot)) throw new ArgumentException($"{prefix}: duplicate slot {draft.Slot}.");
            if (!Enum.IsDefined(draft.Mode)) throw new ArgumentException($"{prefix}: invalid mode.");
            var pairs = new Dictionary<string, string>(StringComparer.Ordinal);
            using var reader = new StringReader(draft.Entries.StartsWith('\uFEFF') ? draft.Entries[1..] : draft.Entries);
            var lineNumber = 0;
            while (reader.ReadLine() is { } line)
            {
                lineNumber++;
                if (string.IsNullOrWhiteSpace(line) || line.TrimStart().StartsWith('#')) continue;
                var tab = line.IndexOf('\t');
                if (tab < 0) throw new ArgumentException($"{prefix}, line {lineNumber}: missing TAB separator.");
                var source = line[..tab];
                var target = line[(tab + 1)..];
                if (source.Length == 0 || target.Length == 0)
                    throw new ArgumentException($"{prefix}, line {lineNumber}: source and target must be nonempty.");
                // Pairs are exact strings. Preserve spaces and additional tabs, including trailing whitespace.
                pairs[source] = target;
            }
            if (pairs.Count == 0) throw new ArgumentException($"{prefix}: enter at least one source/target pair.");
            specs.Add(new CustomDictSpec { Slot = draft.Slot, Mode = draft.Mode, Pairs = pairs });
        }
        return specs.ToArray();
    }
}
