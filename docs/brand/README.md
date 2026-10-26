# Open Clicker — design system

An open source TV remote. MIT licensed.

```
tokens.json          the tokens: colour (Ivory and Late show themes), type, spacing, radius, shadow, hardware (mm)
tokens.css           the same tokens compiled to CSS custom properties, .<style> classes and both themes
brand-book/          overview, brand & voice, hardware rules, the three templates, the design tool
components/          bundle.js (window.OpenClicker: Key, Button, Badge, Segmented, Field, Glyph), bundle.css, index.d.ts,
                     a README + live preview.html per component and showcase page (open them from disk), and React 18.3.1 UMD in lib/
assets/Logos/        the O/C monogram — two-colour, oxblood-only, ivory-only
assets/Legends/      the keycap legend / icon glyph set, in oxblood and ivory
renders/             PNG renders of the cover, the three remotes, the tool shell and the components, both themes
index.html           an index of the previews with a theme toggle
```

Start with `brand-book/00-overview.md`. To use the tokens, link `tokens.css`; to use the components, add `components/bundle.css`, React and ReactDOM 18, then `components/bundle.js`. Set `data-theme="late-show"` on `<html>` for the dark theme; the default is Ivory.

Fonts are hosted on Google Fonts: Fraunces (`opsz,wght,SOFT,WONK@9..144,400..900,100,1`) and Fredoka (`wght@400..700`). No font files are bundled.
