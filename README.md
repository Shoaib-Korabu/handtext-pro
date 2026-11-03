# ✍ HandText Pro

A free, open-source text-to-handwriting generator. **Upload your assignment** (PDF, Word, text) or type your notes, pick a handwriting, paper and ink, and get print-ready handwritten pages as a PDF in one go.

It's inspired by the feature set of tools like HandtextAI, but it's written from scratch with open-source fonts and libraries. Everything runs in your browser, so your text is never uploaded anywhere.

**Current version: v0.6.0** · [Changelog](CHANGELOG.md)

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

**New in v0.6: the pro features**
- **📷 Photo mode:** your page photographed in a realistic scene, with a slight camera angle, a curved sheet, a soft shadow, window light, a vignette and camera grain. There are four scenes:
  - loose sheet on a wooden desk
  - spiral notebook (rings and punched holes) on a dark desk
  - open exercise book (gutter shadow and staples)
  - sheet on a white table (phone photo, with the phone's shadow)
- **Marks:** select words and tap a button for a highlight (yellow, green, pink or blue), circle, box, underline, double or wavy underline, strike-through, or "mark with X", all drawn by hand. You can also type them: `==highlight==`, `~~strike~~`, `{circle:words}`.
- **Maths:** `$E = mc^2$`, `$H_2O$`, `$\frac{1}{2}$`, `$\pi r^2$`, `$a \le b$`, written in your handwriting with real superscripts and subscripts.
- **Tables:** `a | b | c` rows, or Markdown tables, become hand-ruled tables. Cells wrap, and rows sit on the ruled lines.
- **Write on every 2nd or 3rd line**, plus **wide-ruled** paper.
- **Exports:** transparent PNG (writing only), and Ultra 4K (400 DPI).
- **Your own handwriting font:** upload a .ttf, .otf, .woff or .woff2 file. It's saved in your browser.
- **Paste from ChatGPT, Google Docs or websites:** headings, lists, bold and tables are kept.
- **Keyboard shortcuts:** Ctrl/⌘+Enter to download the PDF, Ctrl/⌘+P to print, Ctrl/⌘+S to save, Ctrl/⌘+O to upload, ← → to change page, Esc to close a window, ? to show all shortcuts.
- **Picker windows:** Handwriting, Ink, Paper & photo and Page size each open a window. You compare the options there (handwriting has search, style filters and ★ favourites), press **Apply**, and only your choice is shown afterwards.

**🖨 Print check: see the printout before you pay for it** *(new in v0.5)*
- A print-shop simulator that shows how each page will really come out of a printer.
- **Printers:** black & white laser (most shops), colour laser, colour inkjet, black & white inkjet. In black & white, colours turn to grey toner and light tints become speckle.
- **Paper in the printer:** plain white copier paper, bright white, recycled, or ruled notebook paper.
- **Sheet size:** same as document, A4, Letter, Legal or A5.
- **Scaling:** Actual size (100%), Fit to printable area, or a custom percentage.
- **Printer margin:** the outer edge a printer can't reach (default 4.2 mm), shown with a dashed red line. Add an extra white border if you want one.
- **Toner/ink density**, and zoom to Fit, Real size (100%) or Close-up (200%).
- It explains in plain words what will happen, for example "4.2 mm of the edge is cut off", and suggests fixes you can apply with one tap.
- Works on these handwritten pages **or any PDF or image** you open.
- Save the simulated printout as a PNG, or all pages as a PDF.

**Printing on** *(new in v0.5)*: choose what the output is for.
- **Digital submission:** the full paper look, with colour, texture and ruling.
- **Plain white paper:** ruled lines and writing on pure white, with no grey tint when printed.
- **Real ruled notebook paper:** only the writing is printed, so it lands on your own paper's lines.

**More human handwriting** *(new in v0.4)*
- **Letter shape variation** (switch, on by default): each letter's strokes are gently bent, so repeated letters really differ in shape: rounder or flatter loops, longer or shorter tails. Its strength follows the *Vary each letter* slider.
- **Tiredness over the page** (switch): neat at the top, then a little faster, taller, looser and more slanted towards the bottom, with slightly lighter ink.
- Every on/off option is now a switch that turns **green** when on.
- Each section shows its current setting on its header, there's a 1-2-3 step guide, and the layout fits phones without sideways scrolling.

**Single pen** *(new in v0.3.1, on by default)*
- Everything is written the same size and thickness, like one person with one pen. Bold marks and big headings from AI-formatted text are ignored.
- **Remove \*\* and # marks** cleans the formatting symbols out of the text itself. Undo brings them back.

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
js/printsim.js      Print check: printer/paper/margin/scaling simulation (placement maths unit-tested)
js/photo.js         Photo mode: generated desk scenes, page warping, light and shadow
js/pickers.js       floating picker windows (choose, compare, Apply)
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
| **v0.4** | ✅ Letter shape variation, tiredness over the page, green on/off switches, section summaries, step guide |
| **v0.5** | ✅ Print check simulator (B&W/colour, printer margin, scaling, padding, toner, paper types, any PDF/image); "Printing on" output modes |
| **v0.6** | ✅ Photo mode (4 scenes), hand-drawn marks & highlights, maths, hand-ruled tables, every-Nth-line writing, transparent PNG, 4K, custom font upload, rich paste, shortcuts, picker windows with Apply |
| v0.7 | Draw on the page (pen, arrows, shapes, stars, notes); images in notes; PowerPoint import; per-paragraph alignment |
| v0.8 | Fit into N pages; leave space for diagrams; Indian notebook styles (Page No./Date box); saved styles |
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
