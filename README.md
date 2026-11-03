# ✍ HandText Pro

A free, open-source text-to-handwriting generator. **Upload your assignment** (PDF, Word, text) or type your notes, pick a handwriting, paper and ink, and get print-ready handwritten pages as a PDF in one go.

It's inspired by the feature set of tools like HandtextAI, but it's written from scratch with open-source fonts and libraries. Everything runs in your browser, so your text is never uploaded anywhere.

**Current version: v0.3.0** · [Changelog](CHANGELOG.md)

🌐 **Live demo:** https://shoaib-korabu.github.io/handtext-pro/

---

## Features

**Upload an assignment → print-ready PDF in one go** *(new in v0.3)*
- Drop or choose a **PDF**, **Word (.docx)**, **.txt** or **.md** file. Drag-and-drop works anywhere on the page.
- The structure is kept:
  - Titles, questions and bold sub-headings become handwritten headings.
  - Bullet and numbered lists stay lists.
  - **Bold** lead-ins stay bold, written with heavier strokes.
  - Lines that a PDF wrapped are joined back into proper paragraphs.
  - Page numbers and repeated headers or footers are removed.
- The handwritten PDF downloads automatically. You can switch this off to check the preview first.
- **Undo** brings back your previous text.
- Helpful messages for scanned PDFs, password-protected files, old `.doc` files and photos.

**Assignment details** *(new in v0.3)*
- Name, roll no., subject and date are written in handwriting in the top margin, on the first page or every page.
- Optional handwritten page numbers.

**Writing**
- Live preview that updates as you type
- Simple formatting: `# Heading`, `## Subheading`, `### Bold line`, `- bullets`, `1. numbered lists`, `**bold**`, and `[pagebreak]` to start a new page
- Long text flows onto as many pages as it needs (up to 100); headings never get stranded at the bottom of a page

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
- **JPG** or **PNG** images: one file for one page, or a **ZIP** for several
- Standard (150 DPI) or High (300 DPI) quality
- **Print** directly at 200 DPI, at the correct page size with no margins (Ctrl/Cmd+P works too)
- Pages are rendered one at a time, so even 100-page documents export without running out of memory
- The preview only draws pages near the screen, so long documents stay fast
- Your text and settings are remembered in your browser
- Works on phones, with Edit and Preview tabs

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
js/importer.js      PDF / Word / text upload → markup (structure rebuild is unit-tested)
js/render.js        paper drawing, handwriting realism engine, header and page numbers
js/export.js        PDF / image / ZIP / print export, one page at a time
js/app.js           app state, controls, preview, downloads
fonts/              18 handwriting fonts (woff2)
vendor/             jsPDF, JSZip, pdf.js, mammoth.js (pdf.js and mammoth load only when you upload)
test/               unit tests (node:test)
```

## Roadmap

| Version | Planned |
|---|---|
| **v0.1** | ✅ Core generator: 18 fonts, 7 papers, 4 page sizes, realism engine, PDF/PNG/JPG/ZIP, print |
| **v0.3** | ✅ Upload PDF/Word/text assignments → handwritten PDF in one go; bold text; name/roll/subject/date header; page numbers; mobile tabs; faster and lighter preview and export |
| v0.4 | Tables drawn as hand-ruled grids; landscape pages; more page sizes |
| v0.5 | Math notation (fractions, powers, symbols); images inside notes; PowerPoint import |
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
- [pdf.js](https://github.com/mozilla/pdf.js), Apache 2.0, see `vendor/pdfjs/LICENSE`.
- [mammoth.js](https://github.com/mwilliamson/mammoth.js), BSD-2-Clause, see `vendor/mammoth.LICENSE`.

HandText Pro is an independent project and isn't affiliated with HandtextAI.
