(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    let preference = 'system';
    try { preference = localStorage.getItem('opencc-theme') || 'system'; } catch {}
    if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
    function apply() {
        const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
        document.documentElement.dataset.bsTheme = theme;
        document.documentElement.style.colorScheme = theme;
    }
    window.openccTheme = {
        get: () => preference,
        set: value => {
            if (!['system', 'light', 'dark'].includes(value)) return;
            preference = value;
            try { localStorage.setItem('opencc-theme', value); } catch {}
            apply();
        }
    };
    media.addEventListener('change', () => { if (preference === 'system') apply(); });
    apply();
})();
