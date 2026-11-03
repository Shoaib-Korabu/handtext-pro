/* HandText Pro — exporting rendered pages to PDF, PNG/JPG and ZIP. */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const toBlob = (canvas, type, quality) =>
    new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, quality));

  /** Multi-page PDF at the exact physical page size. */
  async function pdf(canvases, size, baseName) {
    if (!root.jspdf || !root.jspdf.jsPDF) throw new Error('PDF library not loaded');
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: [size.w, size.h], orientation: 'portrait', compress: true });
    canvases.forEach((c, i) => {
      if (i > 0) doc.addPage([size.w, size.h], 'portrait');
      doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, size.w, size.h, undefined, 'FAST');
    });
    const name = `${baseName}-${stamp()}.pdf`;
    doc.save(name);
    return name;
  }

  /** One image for a single page, or a ZIP of all pages. */
  async function images(canvases, format, baseName) {
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const s = stamp();
    if (canvases.length === 1) {
      const name = `${baseName}-${s}.${ext}`;
      saveBlob(await toBlob(canvases[0], type, 0.92), name);
      return name;
    }
    if (!root.JSZip) throw new Error('ZIP library not loaded');
    const zip = new root.JSZip();
    const pad = String(canvases.length).length;
    for (let i = 0; i < canvases.length; i++) {
      zip.file(`page-${String(i + 1).padStart(pad, '0')}.${ext}`, await toBlob(canvases[i], type, 0.92));
    }
    const name = `${baseName}-${s}.zip`;
    saveBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), name);
    return name;
  }

  HT.Export = { pdf, images, saveBlob };
})(typeof window !== 'undefined' ? window : globalThis);
