/* HandText Pro — configuration: fonts, papers, page sizes, inks, presets.
 * Plain script (no build step). Exposes everything on window.HT.
 */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});

  HT.VERSION = '0.5.0';

  // `cursive: true` = joined-up script; per-letter jitter is reduced so joins stay connected.
  HT.FONTS = [
    { id: 'caveat',                label: 'Caveat',                style: 'Casual' },
    { id: 'kalam',                 label: 'Kalam',                 style: 'Neat' },
    { id: 'patrick-hand',          label: 'Patrick Hand',          style: 'Print' },
    { id: 'indie-flower',          label: 'Indie Flower',          style: 'Rounded' },
    { id: 'gloria-hallelujah',     label: 'Gloria Hallelujah',     style: 'Bubbly' },
    { id: 'architects-daughter',   label: 'Architects Daughter',   style: 'Technical' },
    { id: 'shadows-into-light',    label: 'Shadows Into Light',    style: 'Quick' },
    { id: 'covered-by-your-grace', label: 'Covered By Your Grace', style: 'Marker' },
    { id: 'just-another-hand',     label: 'Just Another Hand',     style: 'Tall' },
    { id: 'nanum-pen-script',      label: 'Nanum Pen',             style: 'Pen' },
    { id: 'reenie-beanie',         label: 'Reenie Beanie',         style: 'Scrawl' },
    { id: 'rock-salt',             label: 'Rock Salt',             style: 'Rough' },
    { id: 'nothing-you-could-do',  label: 'Nothing You Could Do',  style: 'Slanted', cursive: true },
    { id: 'homemade-apple',        label: 'Homemade Apple',        style: 'Cursive', cursive: true },
    { id: 'la-belle-aurore',       label: 'La Belle Aurore',       style: 'Cursive', cursive: true },
    { id: 'cedarville-cursive',    label: 'Cedarville',            style: 'Cursive', cursive: true },
    { id: 'dawning-of-a-new-day',  label: 'Dawning of a New Day',  style: 'Cursive', cursive: true },
    { id: 'zeyada',                label: 'Zeyada',                style: 'Cursive', cursive: true },
  ];

  // Page sizes in millimetres (portrait).
  HT.PAGE_SIZES = [
    { id: 'a4',     label: 'A4 (210 \u00D7 297 mm)',   w: 210,   h: 297 },
    { id: 'letter', label: 'US Letter (8.5 \u00D7 11 in)', w: 215.9, h: 279.4 },
    { id: 'a5',     label: 'A5 (148 \u00D7 210 mm)',   w: 148,   h: 210 },
    { id: 'note',   label: 'Note card (4 \u00D7 6 in)', w: 101.6, h: 152.4 },
  ];

  // lineSpacing (mm) is the paper's natural ruling; picking a paper applies it.
  HT.PAPERS = [
    { id: 'notebook', label: 'Notebook \u2014 ruled with margin', lineSpacing: 8,    bg: '#fffef9' },
    { id: 'college',  label: 'College ruled',                 lineSpacing: 7.1,  bg: '#fffefb' },
    { id: 'legal',    label: 'Legal pad (yellow)',            lineSpacing: 8.7,  bg: '#fdf7c3' },
    { id: 'grid',     label: 'Grid (5 mm)',                   lineSpacing: 7.5,  bg: '#fdfdfb' },
    { id: 'dots',     label: 'Dot grid',                      lineSpacing: 7.5,  bg: '#fdfdfb' },
    { id: 'plain',    label: 'Plain white',                   lineSpacing: 8,    bg: '#ffffff' },
    { id: 'cardstock',label: 'Ivory card stock',              lineSpacing: 8,    bg: '#f8f1e2' },
  ];

  HT.INKS = [
    { id: 'blue',   label: 'Ballpoint blue', color: '#1b3a9e' },
    { id: 'black',  label: 'Black',          color: '#1a1a1a' },
    { id: 'royal',  label: 'Royal blue',     color: '#2648d8' },
    { id: 'red',    label: 'Red',            color: '#b4231c' },
    { id: 'green',  label: 'Green',          color: '#1c6b3c' },
    { id: 'pencil', label: 'Pencil',         color: '#47474c' },
  ];

  // Realism presets — values are 0..100.
  HT.PRESETS = {
    neat:    { movement: 25, inkflow: 30, variation: 25, texture: 25 },
    natural: { movement: 55, inkflow: 55, variation: 55, texture: 45 },
    messy:   { movement: 90, inkflow: 75, variation: 90, texture: 55 },
  };

  HT.DEFAULTS = {
    text: '',
    font: 'caveat',
    ink: 'blue',
    customInk: '#1b3a9e',
    fontSize: 20,        // pt
    lineSpacing: 8,      // mm
    wordSpacing: 100,    // % of normal
    paper: 'notebook',
    pageSize: 'a4',
    margins: { top: 25, right: 15, bottom: 15, left: 30 }, // mm
    movement: 55,
    inkflow: 55,
    variation: 55,
    texture: 45,
    quality: 'high',     // export: 'standard' (150 dpi) | 'high' (300 dpi)
    imageFormat: 'jpg',  // JPG files are ~5x smaller than PNG with paper texture
    header: { name: '', roll: '', subject: '', date: '' },
    headerOn: 'first',   // 'off' | 'first' | 'all'
    pageNumbers: false,
    autoDownload: true,  // download the PDF straight after an upload
    plainPen: true,      // one pen: no bold strokes, no big or underlined headings
    letterShape: true,   // warp each letter's strokes so repeated letters differ in shape
    fatigue: false,      // writing gets looser and faster further down each page
    output: 'digital',   // 'digital' (full paper look) | 'white' (plain white paper) | 'ink' (real notebook paper)
    sim: { source: 'pages', printer: 'bw-laser', paper: 'white', sheet: 'auto', scaling: 'actual', scale: 100, margin: 4.2, padding: 0, density: 100, showArea: true, zoom: 'fit' },
  };

  HT.PAGE_BREAK = '[pagebreak]';
  HT.MAX_PAGES = 100;

  HT.SAMPLE_TEXT = [
    '# Unit 1: Introduction to Computer Networks',
    '',
    'A computer network is a group of computers connected together so they can share data and resources such as printers and internet access.',
    '',
    '## Types of networks',
    '- LAN \u2014 Local Area Network (a home, lab or office)',
    '- MAN \u2014 Metropolitan Area Network (a city)',
    '- WAN \u2014 Wide Area Network (countries; the internet)',
    '',
    '## Why we use networks',
    '1. Sharing files and devices',
    '2. Communication \u2014 email, chat, video calls',
    '3. Centralised backups and security',
    '',
    'Try a different handwriting, paper or ink on the left, then download your pages as a PDF or images.',
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) module.exports = HT;
})(typeof window !== 'undefined' ? window : globalThis);
