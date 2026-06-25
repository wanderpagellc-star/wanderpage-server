import { PDFDocument, PDFName, PDFArray, ParseSpeeds } from 'pdf-lib';
import express from 'express';

const app = express();
app.use(express.json());

const CLOUDINARY_CLOUD  = 'dsepimnas';
const CLOUDINARY_PRESET = 'wanderpage_pdfs';

// ─── A4 layout constants ─────────────────────────────────────────────────────
const PAGE_H   = 841.89;
const MARGIN   = 54;
const CONT_X   = MARGIN;
const CONT_W   = 595.28 - 2 * MARGIN; // 487.28pt
const CONT_TOP = PAGE_H - MARGIN;     // 787.89pt (from PDF bottom)
const CONT_BOT = MARGIN;              // 54pt
const PX2PT    = CONT_W / 651;        // ≈ 0.7485
const LINE_H   = 28 * PX2PT;         // ≈ 20.96pt per printed line

// ─── Shared transparent MK dict ──────────────────────────────────────────────
let _sharedMkRef = null;
function getSharedMk(pdfDoc) {
  if (!_sharedMkRef) {
    const mk = pdfDoc.context.obj({});
    mk.set(PDFName.of('BG'), pdfDoc.context.obj([]));
    _sharedMkRef = pdfDoc.context.register(mk);
  }
  return _sharedMkRef;
}

function addText(form, pdfDoc, page, name, x, y, w, h) {
  if (w < 1 || h < 1) return;
  try {
    const tf = form.createTextField(name);
    tf.addToPage(page, { x, y, width: w, height: h, borderWidth: 0 });
    tf.enableMultiline();
    const mkRef = getSharedMk(pdfDoc);
    for (const widget of tf.acroField.getWidgets()) {
      widget.dict.set(PDFName.of('MK'), mkRef);
    }
  } catch (_) {}
}

function addCheckbox(form, pdfDoc, page, name, x, y, size) {
  try {
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x, y, width: size, height: size, borderWidth: 1 });
  } catch (_) {}
}

/** 34 text fields per page, one per printed line. */
function addLines(form, pdfDoc, page, pid, headerPx, count) {
  const topY = CONT_TOP - headerPx * PX2PT;
  const rows  = Math.min(count, Math.floor((topY - CONT_BOT) / LINE_H));
  for (let i = 0; i < rows; i++) {
    const y = topY - (i + 1) * LINE_H;
    if (y < CONT_BOT - 1) break;
    addText(form, pdfDoc, page, `l_${pid}_${i}`, CONT_X, y, CONT_W, LINE_H);
  }
}

/** Restaurant tracker: 3 column fields per row × 30 rows. */
function addRestaurant(form, pdfDoc, page, pid) {
  const startY = CONT_TOP - 90 * PX2PT;
  const rowH   = 21 * PX2PT;
  const c1W = CONT_W * 0.38;
  const c2W = CONT_W * 0.42;
  const c3W = CONT_W * 0.20;
  for (let i = 0; i < 30; i++) {
    const y = startY - (i + 1) * rowH;
    if (y < CONT_BOT - 1) break;
    addText(form, pdfDoc, page, `rt_n_${pid}_${i}`, CONT_X,           y, c1W, rowH);
    addText(form, pdfDoc, page, `rt_o_${pid}_${i}`, CONT_X + c1W,     y, c2W, rowH);
    addText(form, pdfDoc, page, `rt_r_${pid}_${i}`, CONT_X+c1W+c2W,   y, c3W, rowH);
  }
}

/** Packing list: one checkbox per item row. */
function addPackingList(form, pdfDoc, page, pid) {
  // Checkboxes sit in the left gutter where the printed checkbox squares are.
  // The packing list has 3 columns; each row is ~18px tall.
  const cbSize  = 10;
  const rowH    = 18 * PX2PT;
  const startY  = CONT_TOP - 95 * PX2PT;  // below the section headers
  const colXs   = [CONT_X, CONT_X + CONT_W * 0.36, CONT_X + CONT_W * 0.68];
  const rowsPerCol = 30;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < rowsPerCol; row++) {
      const y = startY - (row + 1) * rowH;
      if (y < CONT_BOT - 1) break;
      addCheckbox(form, pdfDoc, page, `pk_${pid}_${col}_${row}`, colXs[col], y + 2, cbSize);
    }
  }
}

async function processPdf(pdfUrl, phrasebookPages) {
  const PB     = Math.max(0, parseInt(phrasebookPages) || 0);
  const P_PACK = PB + 1;
  const P_BKT  = PB + 2;
  const P_REST = PB + 3;

  const pdfResp = await fetch(pdfUrl);
  if (!pdfResp.ok) throw new Error(`Download failed: ${pdfResp.status}`);
  const pdfBytes = await pdfResp.arrayBuffer();

  _sharedMkRef = null;
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    parseSpeed: ParseSpeeds.Fastest,
  });
  const form = pdfDoc.getForm();
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), pdfDoc.context.obj(true));

  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    if (i === 0)              continue; // cover
    if (i >= 1 && i <= PB)   continue; // phrasebook
    if (i >= 96 && i <= 115) continue; // photo pages

    const page = pdfDoc.getPage(i);

    if (i === P_PACK) {
      addPackingList(form, pdfDoc, page, i);
    } else if (i === P_BKT) {
      addLines(form, pdfDoc, page, i, 64, 34);
    } else if (i === P_REST) {
      addRestaurant(form, pdfDoc, page, i);
    } else if (i === 116) {
      addLines(form, pdfDoc, page, i, 112, 24);
    } else if (i === 117 || i === 118) {
      addLines(form, pdfDoc, page, i, 34, 27);
    } else {
      addLines(form, pdfDoc, page, i, 0, 34);
    }
  }

  return pdfDoc.save();
}

app.post('/process-pdf', async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  try {
    const { pdf_url, phrasebook_pages = 0 } = req.body;
    console.log(`[request] pdf_url=${pdf_url?.slice(0,60)}... phrasebook_pages=${phrasebook_pages}`);
    if (!pdf_url) return res.status(400).json({ error: 'pdf_url required' });

    const modifiedBytes = await processPdf(pdf_url, phrasebook_pages);

    // Upload to Cloudinary
    const fd = new FormData();
    fd.append('file', new Blob([modifiedBytes], { type: 'application/pdf' }), 'journal.pdf');
    fd.append('upload_preset', CLOUDINARY_PRESET);
    const cloudResp = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/raw/upload`,
      { method: 'POST', body: fd }
    );
    if (!cloudResp.ok) throw new Error(`Cloudinary: ${await cloudResp.text()}`);
    const { secure_url } = await cloudResp.json();

    res.set(cors).json({ url: secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).set(cors).json({ error: err.message });
  }
});

app.options('/process-pdf', (req, res) => res.set({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}).sendStatus(204));

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wanderpage PDF server on port ${PORT}`));
