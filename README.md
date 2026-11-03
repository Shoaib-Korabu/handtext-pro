# ✍ HandText Pro

A free, open-source text-to-handwriting generator. Type or paste your notes, pick a handwriting, paper and ink, and download print-ready pages as PDF or images.

It's inspired by the feature set of tools like HandtextAI, but it's written from scratch with open-source fonts and libraries. Everything runs in your browser, so your text is never uploaded anywhere.

**Current version: v0.1.0** · [Changelog](CHANGELOG.md)

🌐 **Live demo:** https://shoaib-korabu.github.io/handtext-pro/

---

## Features in v0.1

**Writing**
- Live preview that updates as you type
- Simple formatting: `# Heading`, `## Subheading`, `- bullets`, `1. numbered lists`, and `[pagebreak]` to start a new page
- Long text flows onto as many pages as it needs, up to 50
- Import `.txt` and `.md` files

**Handwriting**
- 18 handwriting styles, from neat print to joined-up cursive
- Sizes are auto-balanced, so every font looks about the same size
- Adjustable font size and word spacing
- 6 inks (ballpoint blue, black, royal blue, red, green, pencil) plus a custom colour

**Paper and page**
- 7 papers: notebook ruled with margin, college ruled, yellow legal pad, 5 mm grid, dot grid, plain white, ivory card stock
- 4 page sizes: A4, US Letter, A5, 4 × 6 in note card
- Adjustable line spacing and all four margins

**Realism engine**
- **Natural movement:** line starts drift, lines slope slightly, the baseline wobbles and word gaps vary.
- **Vary each letter:** every letter gets its own small tilt, size and slant, so repeated letters never look identical. This is reduced for cursive fonts so joins stay connected.
- **Inkflow:** pen pressure rises and falls along each line, with denser strokes and pen grain.
- **Paper texture:** paper grain and uneven lighting, with ink blended into the paper rather than pasted on top.
- **Presets:** Neat, Natural and Messy.
- The output is deterministic: the same text always gives the same page.

**Download**
- Multi-page **PDF** at the exact paper size
- **PNG** or **JPG** images: one file for one page, or a **ZIP** for several
- Standard (150 DPI) or High (300 DPI) quality
- **Print** directly, at the correct page size with no margins
- Your text and settings are remembered in your browser

## Run it

No install and no build step needed.

```bash
python3 -m http.server 8000      # or: npm start
```

Then open http://localhost:8000. You can also open `index.html` directly, though some browsers block fonts from local files.

## Put it online free (GitHub Pages)

The live demo is served from the `gh-pages` branch. To update it after changing `main`:

```bash
git push origin main:gh-pages
```

(Or in **Settings → Pages**, choose *Deploy from a branch* → **main** / **(root)** to publish straight from `main`.)

## Tests

```bash
npm test
```

## Project structure

```
index.html          page layout and controls
css/app.css         styles (light/dark, mobile, print)
js/config.js        fonts, papers, page sizes, inks, presets, defaults
js/layout.js        text parsing, word wrap and pagination (pure; unit-tested)
js/render.js        paper drawing and the handwriting realism engine
js/export.js        PDF / image / ZIP export
js/app.js           app state, controls, preview, downloads
fonts/              18 handwriting fonts (woff2)
vendor/             jsPDF and JSZip
test/               unit tests (node:test)
```

## Roadmap

| Version | Planned |
|---|---|
| **v0.1** | ✅ Core generator: 18 fonts, 7 papers, 4 page sizes, realism engine, PDF/PNG/JPG/ZIP, print |
| v0.2 | Page header (name, roll no., subject, date), page numbers, more page sizes, landscape |
| v0.3 | Inline **bold**, underline and strike-through; tables; better mobile layout (preview tabs) |
| v0.4 | Import from DOCX and PDF |
| v0.5 | Math notation (fractions, powers, symbols), images inside notes |
| v1.0 | **Photo mode**: pages placed in realistic notebook/desk scenes; stable public release |
| v2.0 | Upload your own handwriting font (TTF/OTF/WOFF) |
| v3.0 | Create a font from a photo of your own handwriting |
| v4.0 | Hand-drawn marks: highlighter, circles, arrows, crossings-out; diagrams |
| v5.0 | Accounts, saved documents, Pro plan, more languages |

## Credits and licences

- Code: MIT licence (see `LICENSE`).
- Fonts are from Google Fonts, packaged by [Fontsource](https://fontsource.org). Rock Salt, Homemade Apple and Just Another Hand are under the Apache License 2.0; all the others are under the SIL Open Font License 1.1.
- [jsPDF](https://github.com/parallax/jsPDF), MIT, see `vendor/jspdf.LICENSE`.
- [JSZip](https://github.com/Stuk/jszip), MIT, see `vendor/jszip.LICENSE.md`.

HandText Pro is an independent project and isn't affiliated with HandtextAI.
