# Changelog

All notable changes to HandText Pro are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [0.6.1] — 2026-11-03

### Changed
- **Laptop and desktop layout:**
  - The app fills the screen, with a compact fixed header.
  - The settings column and the preview scroll separately.
  - Page tabs, zoom, page count and the download buttons share one toolbar row.
  - **Fit page** shows whole pages at any laptop size, side by side on wide screens. **Fit width** makes one page bigger.
  - The settings column width adapts from 320 px up to 480 px.
  - Print check puts its settings in a left column with the printed sheet beside them.
- **Photo mode is crystal clear:** backgrounds are generated at full output resolution, with no upscaling or blur. The wood has real planks, seams, growth rings and fibres, there's a laminate table, a paper-edge highlight, and fine per-pixel sensor grain.

### Added
- **Spiral notebook (side coil)** photo scene, now the default:
  - hard cover and a visible page stack
  - punched holes and C-shaped metal coil loops with shading, highlights and contact shadows
  - a tear-off perforation
- The top-coil spiral notebook scene gets the same realistic coil and cover.

## [0.6.0] — 2026-11-03

### Added
- **Photo mode:** the page is photographed in a generated scene, with perspective, a curved sheet, shadows, light, vignette and grain. Scenes: wooden desk, spiral notebook, exercise book, and white table (phone photo). Works in the preview, PDF, images and Print check.
- **Hand-drawn marks:**
  - highlights in yellow, green, pink or blue (drawn under the writing)
  - circle, box, underline, double underline, wavy underline, strike-through and "mark with X" (drawn in the pen's ink)
  - a toolbar to mark the selected words, plus typed shortcuts: `==…==`, `~~…~~`, `{tag:…}`
- **Maths in `$…$`:** superscripts and subscripts, `\frac`, `\sqrt`, Greek letters and common symbols. Prices like "$5 and $10" are left alone.
- **Tables:** pipe rows and Markdown tables become hand-ruled tables with wrapped cells aligned to the ruled lines. Rows stay on one page.
- Write on every 1st, 2nd or 3rd ruled line. Added a Wide ruled paper.
- Transparent PNG (writing only) and Ultra 4K (400 DPI) exports.
- Upload your own handwriting font (.ttf, .otf, .woff, .woff2), saved in the browser with IndexedDB.
- Pasting from ChatGPT, Google Docs or web pages keeps headings, lists, bold and tables (undoable).
- Keyboard shortcuts, listed with "?".
- **Picker windows** for Handwriting, Ink, Paper & photo and Page size, each with an Apply button:
  - handwriting: search, style filters, favourites, and samples written with your own text
  - paper: thumbnails, and photo scenes previewed with your page

### Changed
- The Look section shows only the current handwriting, ink, paper and page size as buttons, which open the pickers. The Paper & page section is now Page layout & printing.

## [0.5.0] — 2026-11-03

### Added
- **Print check**, a simulated printout for the handwritten pages or any PDF or image:
  - black & white laser (dot gain, toner speckle in light tints), colour laser, colour inkjet, black & white inkjet
  - plain, bright, recycled or ruled notebook paper, with paper colour and fibres
  - sheet size, scaling (actual, fit to printable area, custom), printer margin and extra white border
  - toner density, an overlay showing the area the printer can't reach, and Fit, 100% or 200% zoom
  - a plain-English summary and one-tap fixes
  - save the simulation as a PNG or a PDF of all pages
- **Printing on** option:
  - digital (full paper look)
  - plain white paper (ruling and writing, no paper colour or texture)
  - real notebook paper (writing only)

### Fixed
- Pages meant for printing no longer carry the on-screen paper colour and texture. On a real printer these turned into a grey tint, with a white frame where the printer can't reach. This is now controlled by **Printing on**.

## [0.4.0] — 2026-11-03

### Added
- **Letter shape variation** (on by default): each letter is warped along smooth curves. Rows shift and stretch, and columns rise and squash, so loops, bowls and tails change shape from one letter to the next. There are six cached variants per letter, built at 2× for crisp edges. The effect is gentler on cursive fonts so letters stay joined.
- **Tiredness over the page**: further down each page, and slightly across the document, writing gets looser and more slanted, letters get a little taller, and the ink gets lighter.
- Green on/off switches for Auto-download, Single pen, Page numbers, Letter shapes and Tiredness.
- Section headers show the current setting (for example "Caveat · ballpoint blue · single pen").
- A 1-2-3 step guide at the top, and icons on the Download and Print buttons.

### Changed
- Realism now sits above Paper & page. Download options are collapsed by default, because the main Download PDF button is always in the preview bar.

### Fixed
- On phones, the settings column was 1px wider than the screen and caused sideways scrolling.

## [0.3.1] — 2026-11-03

### Added
- **Single pen** mode, on by default. Headings are written at normal size, `**bold**` is ignored, and there are no underlines, so the page looks like one person wrote it with one pen.
- A **Remove \*\* and # marks** button that strips formatting symbols from the text (undoable).

### Changed
- Pen-pressure shading now fades in and out smoothly and is lighter, so no word looks like it was written with a thicker pen.

## [0.3.0] — 2026-11-03

### Added
- **Upload an assignment:** PDF, Word (.docx), .txt, .md or .html becomes handwritten pages, and the PDF downloads automatically. This can be switched off.
- PDF structure rebuild:
  - Titles, questions and bold sub-headings become headings.
  - Bullets and numbered lists are kept, and bold lead-ins stay bold.
  - Wrapped lines and hyphenated words are joined back together.
  - Page numbers and repeated headers or footers are dropped.
- Word import keeps headings, lists, bold and table rows. A Word "Title" style becomes the top heading.
- Drag and drop anywhere on the page, plus an Undo after import or clear.
- Clear messages for scanned PDFs, password-protected PDFs, old `.doc` files, photos and unsupported formats.
- `### Bold line` headings and inline `**bold**` text, drawn with heavier pen strokes.
- Assignment details (name, roll no., subject, date) written in the top margin, on the first page or every page, with a "Today" button.
- Handwritten page numbers.
- A sticky preview bar with Download PDF and Print always in reach, and live progress messages.
- Edit and Preview tabs on phones.

### Changed
- Exports render one page at a time, so large documents no longer risk running out of memory.
- The preview only draws pages near the screen, and frees far-away pages in long documents.
- Print now uses 200 DPI page images at the exact paper size. Ctrl/Cmd+P uses the same path.
- Exported files are named after the uploaded file, for example `assignment-handwritten-….pdf`.
- JPG is the default image format, giving files about 5× smaller than PNG.
- The page limit is raised from 50 to 100.

### Fixed
- A wrapped heading near the bottom of a page could be left stranded without its first line.
- Saved settings with out-of-range or removed values (font, paper, margins) could break the layout after an update.
- Non-ASCII characters in the source are now escaped, so scripts work whatever encoding they are served with.

## [0.1.0] — 2026-11-03

First release.

### Added
- Live handwritten preview with automatic pagination (up to 50 pages)
- Formatting: headings, subheadings, bullet and numbered lists, page breaks
- 18 handwriting fonts with automatic size balancing
- Font size and word spacing controls
- 6 ink colours plus a custom colour
- 7 paper styles and 4 page sizes, with adjustable line spacing and margins
- Realism engine: natural movement, per-letter variation, inkflow, paper texture, plus Neat, Natural and Messy presets
- Export to multi-page PDF, PNG or JPG (ZIP for multiple pages) at 150 or 300 DPI
- Print at the exact page size
- Import of `.txt` and `.md` files
- Settings and text saved in the browser
- Responsive layout and dark mode for the interface
- Unit tests for parsing and layout
