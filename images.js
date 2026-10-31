// ضغط الصور على الموبايل قبل تخزينها داخل Firestore (مجانًا من غير Storage)
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('bad-image'));
    img.src = src;
  });
}

function drawScaled(img, maxSide) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d');
  x.fillStyle = '#fff';            // خلفية بيضا للصور الشفافة
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// بيصغّر الجودة والمقاس تدريجيًا لحد ما حجم النص (base64) يبقى مناسب
function shrink(img, maxSide, quality, maxChars) {
  let side = maxSide, q = quality;
  for (let i = 0; i < 8; i++) {
    const out = drawScaled(img, side).toDataURL('image/jpeg', q);
    if (out.length <= maxChars) return out;
    q = Math.max(0.4, q - 0.1);
    side = Math.round(side * 0.85);
  }
  return drawScaled(img, 300).toDataURL('image/jpeg', 0.4);
}

export async function compressFile(file, maxSide = 800, quality = 0.72, maxChars = 140000) {
  const url = URL.createObjectURL(file);
  try { return shrink(await loadImage(url), maxSide, quality, maxChars); }
  finally { URL.revokeObjectURL(url); }
}

export async function makeThumb(dataUrl) {
  return shrink(await loadImage(dataUrl), 360, 0.7, 50000);
}

// نتأكد إن النص صورة حقيقية قبل ما نحطه في src
export const isImageData = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
