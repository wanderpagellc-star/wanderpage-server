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
// Standard line-fill helper — used for bucket list, reflections, filler pages, etc.
function addLines(form, pdfDoc, page, pid, headerPx, count) {
  const topY = CONT_TOP - headerPx * PX2PT;
  const rows  = Math.min(count, Math.floor((topY - CONT_BOT) / LINE_H));
  for (let i = 0; i < rows; i++) {
    const y = topY - (i + 1) * LINE_H;
    if (y < CONT_BOT - 1) break;
    addText(form, pdfDoc, page, `l_${pid}_${i}`, CONT_X, y, CONT_W, LINE_H);
  }
}
// Fills a vertical range (CSS px offsets from content top) with as many lines as fit.
// Row count is computed dynamically from available space — no hardcoded counts needed,
// so changing IMG_H/IMG_COL below automatically yields fewer/more lines with no other changes.
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
// Layout-aware AcroForm fields for the illustrated day page (1 of the 2 pages per day).
// layout: 0 = top, 1 = middle, 2 = bottom (matches PDFMonkey cycle order)
//
// CORRECTED July 13, 2026: previously assumed middle/bottom images rendered at 468px
// (360 * 1.30), mirroring print's asymmetric Adjustment 4 treatment. The actual digital
// template CSS has .img-top and .img-wrap BOTH at a flat 360px — no asymmetry — so that
// assumption was wrong and would have misaligned fields on every middle/bottom day page.
// Both layout heights are now 360px, matching the real CSS.
function addDayFields(form, pdfDoc, page, pid, layout) {
  const HEADER      = 55;
  const IMG_H_TOP    = 360;
  const IMG_H_MIDBOT = 360;  // was 468 — corrected to match actual CSS (.img-wrap is flat 360px)
  const IMG_MRG     = 10;
  const LN          = 28;
  const IMG_COL  = 0.55 * CONT_W;
  const GAP      = 12 * PX2PT;
  const LINE_COL = CONT_W - IMG_COL - GAP;
  const RIGHT_X  = CONT_X + IMG_COL + GAP;
  if (layout === 0) {
    const imgEnd = HEADER + IMG_H_TOP + IMG_MRG;
    addLineRange(form, pdfDoc, page, `l_${pid}`, imgEnd);
  } else if (layout === 1) {
    const gridStart = HEADER + 10 * LN;
    const gridEnd   = gridStart + IMG_H_MIDBOT;
    addLineRange(form, pdfDoc, page, `l_${pid}_a`, HEADER,    gridStart);
    addLineRange(form, pdfDoc, page, `l_${pid}_g`, gridStart, gridEnd,   RIGHT_X, LINE_COL);
    addLineRange(form, pdfDoc, page, `l_${pid}_b`, gridEnd);
  } else {
    const gridStart = HEADER + 17 * LN;
    const gridEnd   = gridStart + IMG_H_MIDBOT;
    addLineRange(form, pdfDoc, page, `l_${pid}_a`, HEADER,    gridStart);
    addLineRange(form, pdfDoc, page, `l_${pid}_g`, gridStart, gridEnd,   CONT_X, LINE_COL);
  }
}
function addPhotoField(form, pdfDoc, page, pid) {
  try {
    const btn = form.createButton(`photo_${pid}`);
    btn.addToPage(page, {
      x: CONT_X, y: CONT_BOT,
      width: CONT_W, height: CONT_TOP - CONT_BOT,
      borderWidth: 0,
    });
    const mkRef = getSharedMk(pdfDoc);
    for (const widget of btn.acroField.getWidgets()) {
      widget.dict.set(PDFName.of('MK'), mkRef);
    }
  } catch (_) {}
}
function addRestaurant(form, pdfDoc, page, pid) {
  const startY = CONT_TOP - 86 * PX2PT;
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
  drawItems(0, ['H','I','I','I','I','I','I','I','I','I','_','_','H','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','I','_','_']);
  drawItems(1, ['H','I','I','I','_','_','H','I','I','I','I','I','I','I','I','I','I','_','_','H','I','I','I','I','I','I','I','I','_','_','H','I','I','I','I','I','I','_','_']);
  drawItems(2, ['H','S','I','I','I','I','I','S','I','I','I','I','I','I','I','S','I','I','I','I','I','I','S','I','I','I','I','I','I','S','I','I','I','I','I','I','_','_']);
}
async function processPdf(pdfUrl, phrasebookPages, numDays) {
  const PB = Math.max(0, parseInt(phrasebookPages) || 0);
  const N  = Math.max(0, parseInt(numDays) || 0);
  // ---- Page index map — CORRECTED July 13, 2026 for the actual digital template structure ----
  // The digital PDFMonkey template (8ECC6E2C) has NO separate title page and NO blank spacer
  // pages anywhere (those are print-only: Adjustments 1, 2, 3, 8). Its cover page carries the
  // title text directly. Phrasebook/packing/bucket/restaurant run back-to-back. This is the fix
  // for the "accidentally changed" index math that had 4 phantom pages baked in, shifting every
  // field placement after the phrasebook onto the wrong page.
  //
  // idx 0             : Cover (title text included, no fields)
  // idx 1..PB          : Phrasebook (PB = total phrasebook page count, no fields)
  // idx (1+PB)         : Packing List
  // idx (2+PB)         : Travel Bucket List
  // idx (3+PB)         : Restaurant Tracker
  // idx (4+PB)..(3+PB+2N) : Day pages (illustrated + full journal, alternating)
  // next 5 pages       : Illustration section (Adjustment 5) — no fields, no blank spacers
  // next 1 page        : "And Now, Room for More" title page (Adjustment 6) — no fields
  // next K pages        : Free journal filler pages
  // idx 96-115          : Photo pages (20, unchanged)
  // idx 116-119          : Post-Trip Reflections (4, unchanged)
  const P_PACK       = PB + 1;
  const P_BKT        = PB + 2;
  const P_REST       = PB + 3;
  const DAY_START    = PB + 4;
  const DAY_END      = DAY_START + N * 2;
  const ILLUS_START  = DAY_END;
  const ILLUS_END    = DAY_END + 5;    // exclusive — 5 illustration pages, no blank spacers
  const ROOM_PAGE    = ILLUS_END;
  const FILLER_START = ROOM_PAGE + 1;
  const FILLER_END   = 95;             // inclusive; page 96 is first photo page
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
  console.log(`[layout] pageCount=${pageCount} PB=${PB} N=${N} P_PACK=${P_PACK} P_BKT=${P_BKT} P_REST=${P_REST} DAY_START=${DAY_START} DAY_END=${DAY_END} ILLUS_START=${ILLUS_START} ILLUS_END=${ILLUS_END} ROOM_PAGE=${ROOM_PAGE} FILLER_START=${FILLER_START}`);
  if (FILLER_START > 96) console.error(`[layout] WARNING: FILLER_START=${FILLER_START} exceeds photo section boundary (96) — trip too long for template.`);
  for (let i = 0; i < pageCount; i++) {
    // Cover and phrasebook pages have no interactive fields
    if (i === 0) continue;                          // cover
    if (i >= 1 && i <= PB) continue;                 // phrasebook
    if (i >= ILLUS_START && i < ILLUS_END) continue; // illustration section — no fields (Adjustment 5)
    if (i === ROOM_PAGE) continue;                   // "And Now, Room for More" — no fields (Adjustment 6)
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
      const dayIndex = (i - DAY_START) / 2;
      const layout   = dayIndex % 3;
      addDayFields(form, pdfDoc, page, i, layout);
    } else {
      // covers: odd day-index pages (the full plain journal page per day), and filler pages
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
