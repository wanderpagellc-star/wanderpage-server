import { PDFDocument, PDFName, PDFArray, ParseSpeeds } from 'pdf-lib';
import express from 'express';

const app = express();
app.use(express.json());

const CLOUDINARY_CLOUD  = 'dsepimnas';
const CLOUDINARY_PRESET = 'wanderpage_pdfs';

const PAGE_H   = 841.89;
const MARGIN   = 54;
const CONT_X   = MARGIN;
const CONT_W   = 595.28 - 2 * MARGIN;
const CONT_TOP = PAGE_H - MARGIN;
const CONT_BOT = MARGIN;
const PX2PT    = 0.75;
const LINE_H   = 28 * PX2PT;

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

// Original addLines — used for all non-day pages (bucket list, reflections, fillers, etc.)
function addLines(form, pdfDoc, page, pid, headerPx, count) {
  const topY = CONT_TOP - headerPx * PX2PT;
  const rows  = Math.min(count, Math.floor((topY - CONT_BOT) / LINE_H));
  for (let i = 0; i < rows; i++) {
    const y = topY - (i + 1) * LINE_H;
    if (y < CONT_BOT - 1) break;
    addText(form, pdfDoc, page, `l_${pid}_${i}`, CONT_X, y, CONT_W, LINE_H);
  }
}

// Add fields within a vertical range (CSS px offsets from content top).
// startPx: where fields begin. endPx: where fields end (omit = page bottom).
// fieldX / fieldW: optional overrides for x position and width (in pt).
function addLineRange(form, pdfDoc, page, namePrefix, startPx, endPx, fieldX, fieldW) {
  const x = (fieldX !== undefined) ? fieldX : CONT_X;
  const w = (fieldW !== undefined) ? fieldW : CONT_W;
  if (w < 1) return;
  const topY = CONT_TOP - startPx * PX2PT;
  const botY = (endPx !== undefined) ? Math.max(CONT_TOP - endPx * PX2PT, CONT_BOT) : CONT_BOT;
  let idx = 0;
  let y   = topY - LINE_H;
  while (y >= botY - 1) {
    addText(form, pdfDoc, page, `${namePrefix}_${idx}`, x, y, w, LINE_H);
    idx++;
    y -= LINE_H;
  }
}

// Layout-aware AcroForm fields for day pages with illustrations.
// layout: 0 = top, 1 = middle, 2 = bottom  (matches PDFMonkey cycle order)
//
// Pixel layout reference (CSS px from content top, content area = 979px):
//   TOP:    header 0-55 | img-top 55-425 | 17 lines 425-901
//   MIDDLE: header 0-55 | 10 lines 55-335 | grid-left 335-695 (42% img left | 58% lines right) | lines 695+
//   BOTTOM: header 0-55 | 17 lines 55-531 | grid-right 531-891 (58% lines left | 42% img right)
function addDayFields(form, pdfDoc, page, pid, layout) {
  // Grid column dimensions (pt)
  const IMG_COL  = 0.42 * CONT_W;          // image column (42%)
  const GAP      = 12 * PX2PT;             // grid gap (12px → 9pt)
  const LINE_COL = CONT_W - IMG_COL - GAP; // lines column (~273.6pt)
  const RIGHT_X  = CONT_X + IMG_COL + GAP; // x-start of right column

  // Pixel offsets
  const HEADER  = 55;   // day header height (px)
  const IMG_H   = 360;  // illustration height (px)
  const IMG_MRG = 10;   // margin-bottom on img-top (px)
  const LN      = 28;   // line height (px)

  if (layout === 0) {
    // TOP: image fills 55→425px; fields start below image
    const imgEnd = HEADER + IMG_H + IMG_MRG; // 425px
    addLineRange(form, pdfDoc, page, `l_${pid}`, imgEnd);

  } else if (layout === 1) {
    // MIDDLE: 10 full-width lines, then grid-left (42% img | 58% lines), then full-width lines
    const gridStart = HEADER + 10 * LN;  // 335px
    const gridEnd   = gridStart + IMG_H; // 695px
    addLineRange(form, pdfDoc, page, `l_${pid}_a`, HEADER,    gridStart);
    addLineRange(form, pdfDoc, page, `l_${pid}_g`, gridStart, gridEnd,   RIGHT_X, LINE_COL);
    addLineRange(form, pdfDoc, page, `l_${pid}_b`, gridEnd);

  } else {
    // BOTTOM: 17 full-width lines, then grid-right (58% lines | 42% img)
    const gridStart = HEADER + 17 * LN;  // 531px
    const gridEnd   = gridStart + IMG_H; // 891px
    addLineRange(form, pdfDoc, page, `l_${pid}_a`, HEADER,    gridStart);
    addLineRange(form, pdfDoc, page, `l_${pid}_g`, gridStart, gridEnd,   CONT_X, LINE_COL);
    // Only ~88px remains below grid — skip
  }
}

function addPhotoField(form, pdfDoc, page, pid) {
  try {
    const btn = form.createButton(`photo_${pid}`);
    btn.addToPage(page, {
      x: CONT_X,
      y: CONT_BOT,
      width: CONT_W,
      height: CONT_TOP - CONT_BOT,
      borderWidth: 0,
    });
    const mkRef = getSharedMk(pdfDoc);
    for (const widget of btn.acroField.getWidgets()) {
      widget.dict.set(PDFName.of('MK'), mkRef);
    }
  } catch (_) {}
}

function addRestaurant(form, pdfDoc, page, pid) {
  const startY = CONT_TOP - 64 * PX2PT;
  const rowH   = 42 * PX2PT;
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

function addPackingList(form, pdfDoc, page, pid) {
  const COL_W = (651 - 20) / 3;
  const GAP   = 10;
  const colXs = [0, COL_W + GAP, 2 * (COL_W + GAP)].map(cx => CONT_X + (cx + 16) * PX2PT);

  const cbSize  = 8;
  const TITLE_H = 43;
  const HEAD_H  = 26;
  const SUB_H   = 15;
  const ITEM_H  = 14;

  const gridTopY = CONT_TOP - TITLE_H * PX2PT;

  function drawItems(colIdx, layout) {
    let y = gridTopY;
    let idx = 0;
    for (const el of layout) {
      const hPx = el === 'H' ? HEAD_H : el === 'S' ? SUB_H : ITEM_H;
      y -= hPx * PX2PT;
      if (el === 'I') {
        const cbY = y + (ITEM_H * PX2PT - cbSize) / 2;
        if (cbY > CONT_BOT)
          addCheckbox(form, pdfDoc, page, `pk_${pid}_${colIdx}_${idx++}`, colXs[colIdx], cbY, cbSize);
      }
    }
  }

  drawItems(0, [
    'H','I','I','I','I','I','I','I','I','I',
    '_','_',
    'H','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I',
    '_','_',
  ]);

  drawItems(1, [
    'H','I','I','I',
    '_','_',
    'H','I','I','I','I','I','I','I','I','I','I',
    '_','_',
    'H','I','I','I','I','I','I','I','I',
    '_','_',
    'H','I','I','I','I','I','I',
    '_','_',
  ]);

  drawItems(2, [
    'H',
    'S','I','I','I','I','I',
    'S','I','I','I','I','I','I','I',
    'S','I','I','I','I','I','I',
    'S','I','I','I','I','I','I',
    'S','I','I','I','I','I','I',
    '_','_',
  ]);
}

async function processPdf(pdfUrl, phrasebookPages, numDays) {
  const PB        = Math.max(0, parseInt(phrasebookPages) || 0);
  const N         = Math.max(0, parseInt(numDays) || 0);
  const P_PACK    = PB + 1;  // packing list (first after phrasebook in template)
  const P_BKT     = PB + 2;  // bucket list (second)
  const P_REST    = PB + 3;
  const DAY_START = PB + 4;
  const DAY_END   = DAY_START + N * 2; // first page after all day pairs

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
  console.log(`[layout] pageCount=${pageCount} PB=${PB} N=${N} P_PACK=${P_PACK} P_BKT=${P_BKT} P_REST=${P_REST} DAY_START=${DAY_START} DAY_END=${DAY_END}`);
  if (DAY_END > 95) console.error(`[layout] WARNING: DAY_END=${DAY_END} exceeds photo section boundary (95). phrasebook_pages may be wrong.`);

  for (let i = 0; i < pageCount; i++) {
    if (i === 0)            continue; // cover
    if (i >= 1 && i <= PB) continue; // phrasebook
    if (i >= 96 && i <= 115) {
      addPhotoField(form, pdfDoc, pdfDoc.getPage(i), i);
      continue;
    }

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
    } else if (N > 0 && i >= DAY_START && i < DAY_END && (i - DAY_START) % 2 === 0) {
      // Day page with illustration — layout determined by position in cycle
      const dayIndex = (i - DAY_START) / 2; // 0-based
      const layout   = dayIndex % 3;         // 0=top, 1=middle, 2=bottom
      addDayFields(form, pdfDoc, page, i, layout);
    } else {
      // Filler pages, extra journal pages, reflection free-write page
      addLines(form, pdfDoc, page, i, 55, 34);
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
    const { pdf_url, phrasebook_pages = 0, num_days = 0 } = req.body;
    console.log(`[request] pdf_url=${pdf_url?.slice(0,60)}... phrasebook_pages=${phrasebook_pages} num_days=${num_days}`);
    if (!pdf_url) return res.status(400).json({ error: 'pdf_url required' });

    const modifiedBytes = await processPdf(pdf_url, phrasebook_pages, num_days);

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
