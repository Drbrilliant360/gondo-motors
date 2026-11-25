/* Gondo Motors — private file uploads (payment proofs, order documents).
   The file goes straight from the browser to Cloudinary with a signature from our server; the form then sends
   only the upload's id, which the server verifies before saving. */
(function () {
  'use strict';
  const send = window.GondoApi.send;
  const MAX = 10 * 1024 * 1024;
  async function shrink(file) {
    if (!/^image\//.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file), scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1_500_000) return file;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.88));
    } catch { return file; }
  }
  document.querySelectorAll('form').forEach((form) => {
    const input = form.querySelector('input[type=file][data-upload]'); if (!input) return;
    form.gmBeforeSubmit = async () => {
      const file = input.files[0]; if (!file) return {};
      if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) throw new Error('Choose a JPG, PNG, WebP or PDF file.');
      const kind = input.dataset.upload, sig = await send(input.dataset.uploadSign, { kind });
      if (!sig.ok) throw new Error((sig.body && sig.body.error) || 'Could not start the upload.');
      const body = await shrink(file);
      if (body.size > MAX) throw new Error('That file is larger than 10 MB. Choose a smaller one.');
      const fd = new FormData();
      Object.entries(sig.body.fields).forEach(([k, v]) => fd.append(k, v));
      fd.append('file', body, file.name);
      const res = await fetch(sig.body.url, { method: 'POST', body: fd });
      const up = await res.json().catch(() => ({}));
      if (!res.ok || !up.public_id) throw new Error((up.error && up.error.message) || 'The file could not be uploaded.');
      const out = { public_id: up.public_id, version: String(up.version), signature: up.signature, format: up.format || '', filename: file.name };
      return kind === 'proof' ? Object.fromEntries(Object.entries(out).map(([k, v]) => [`proof_${k}`, v])) : out;
    };
  });
})();
