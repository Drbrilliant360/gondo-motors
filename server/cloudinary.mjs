// Cloudinary without the SDK. Browsers upload straight to Cloudinary with a short-lived signature issued here
// (the API secret never leaves the server, and large photos don't pass through our own request limits).
import crypto from 'node:crypto';

const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
export const cloudinaryReady = Boolean(cloud && key && secret);
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const sign = (params) => sha1(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&') + secret);

// Parameters the browser must send with the file. Anything not listed here would invalidate the signature.
export function signUpload({ folder, type = 'upload', resourceType = 'image' }) {
  const params = { folder, timestamp: Math.floor(Date.now() / 1000), ...(type !== 'upload' ? { type } : {}) };
  return { url: `https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`, fields: { ...params, api_key: key, signature: sign(params) } };
}

// Cloudinary signs its upload response; checking it proves the browser really uploaded this asset to our account.
export function verifyUpload({ public_id, version, signature }) {
  if (typeof public_id !== 'string' || !/^[\w\-./]{1,200}$/.test(public_id) || !/^\d{1,15}$/.test(String(version)) || typeof signature !== 'string') return false;
  const expected = sha1(`public_id=${public_id}&version=${version}${secret}`);
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const base = () => `https://res.cloudinary.com/${cloud}/image/upload`;
export const photoUrls = (publicId, version) => ({
  url: `${base()}/f_auto,q_auto,c_limit,w_1600/v${version}/${publicId}`,
  thumb: `${base()}/f_auto,q_auto,c_fill,w_640,h_480/v${version}/${publicId}`,
});

export async function destroyAsset(publicId, { type = 'upload', resourceType = 'image' } = {}) {
  const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), ...(type !== 'upload' ? { type } : {}) };
  const body = new URLSearchParams({ ...params, api_key: key, signature: sign(params) });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/destroy`, { method: 'POST', body });
  return res.ok;
}

/* ---------- private files: payment proofs and order documents ----------
   Uploaded as "authenticated" assets, so there is no public URL to guess or list.
   After the server has checked who is asking, it hands out a download link that expires in a minute. */
export const signPrivateUpload = (folder, resourceType) => signUpload({ folder, type: 'authenticated', resourceType });
export function privateDownloadUrl({ publicId, format, resourceType = 'image' }, seconds = 60) {
  const now = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, type: 'authenticated', timestamp: now, expires_at: now + seconds, ...(resourceType === 'image' && format ? { format } : {}) };
  const q = new URLSearchParams({ ...params, api_key: key, signature: sign(params) });
  return `https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/download?${q}`;
}
export const destroyPrivate = (publicId, resourceType = 'image') => destroyAsset(publicId, { type: 'authenticated', resourceType });
