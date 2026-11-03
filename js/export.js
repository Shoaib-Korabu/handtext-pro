/* HandText Pro — exporting pages to PDF, PNG/JPG, ZIP and print images.
 *
 * Pages are rendered one at a time into a single reusable canvas, so even a
 * 100-page document at 300 DPI never holds more than one full page in memory.
 */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function safeName(name) {
    const s = String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
    return (s || 'handwritten-notes').slice(0, 60);
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  const toBlob = (canvas, type, quality) =>
    new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the browser ran out of memory while encoding the image'))), type, quality));

  const nextFrame = () => new Promise((r) => setTimeout(r, 0));

  /**
   * job: { count, size: {w,h}, renderTo(index, canvas) }
   */
  async function pdf(job, baseName, onProgress) {
    if (!root.jspdf || !root.jspdf.jsPDF) throw new Error('the PDF library did not load \u2014 check your connection and reload');
    const { jsPDF } = root.jspdf;
    const { w, h } = job.size;
    const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
    const canvas = document.createElement('canvas');
    for (let i = 0; i < job.count; i++) {
      onProgress && onProgress(`Creating PDF: page ${i + 1} of ${job.count}\u2026`);
      await nextFrame();
      await job.renderTo(i, canvas);
      if (i > 0) doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
      const blob = await toBlob(canvas, 'image/jpeg', 0.85);
      doc.addImage(new Uint8Array(await blob.arrayBuffer()), 'JPEG', 0, 0, w, h, `p${i}`, 'NONE');
    }
    canvas.width = canvas.height = 1;
    const name = `${safeName(baseName)}-${stamp()}.pdf`;
    saveBlob(doc.output('blob'), name);
    return name;
  }

  /** One image for a single page, or a ZIP of all pages. */
  async function images(job, format, baseName, onProgress) {
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const base = `${safeName(baseName)}-${stamp()}`;
    const canvas = document.createElement('canvas');
    try {
      if (job.count === 1) {
        onProgress && onProgress('Creating image\u2026');
        await nextFrame();
        await job.renderTo(0, canvas);
        const name = `${base}.${ext}`;
        saveBlob(await toBlob(canvas, type, 0.92), name);
        return name;
      }
      if (!root.JSZip) throw new Error('the ZIP library did not load \u2014 check your connection and reload');
      const zip = new root.JSZip();
      const pad = String(job.count).length;
      for (let i = 0; i < job.count; i++) {
        onProgress && onProgress(`Creating images: page ${i + 1} of ${job.count}\u2026`);
        await nextFrame();
        await job.renderTo(i, canvas);
        zip.file(`page-${String(i + 1).padStart(pad, '0')}.${ext}`, await toBlob(canvas, type, 0.92));
      }
      onProgress && onProgress('Packing ZIP\u2026');
      const name = `${base}.zip`;
      saveBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), name);
      return name;
    } finally {
      canvas.width = canvas.height = 1;
    }
  }

  /** Render pages to JPEG object URLs (for printing). Caller revokes them. */
  async function pageUrls(job, onProgress) {
    const canvas = document.createElement('canvas');
    const urls = [];
    try {
      for (let i = 0; i < job.count; i++) {
        onProgress && onProgress(`Preparing page ${i + 1} of ${job.count} for printing\u2026`);
        await nextFrame();
        await job.renderTo(i, canvas);
        urls.push(URL.createObjectURL(await toBlob(canvas, 'image/jpeg', 0.92)));
      }
    } catch (err) {
      urls.forEach((u) => URL.revokeObjectURL(u));
      throw err;
    } finally {
      canvas.width = canvas.height = 1;
    }
    return urls;
  }

  HT.Export = { pdf, images, pageUrls, saveBlob, safeName };
})(typeof window !== 'undefined' ? window : globalThis);
