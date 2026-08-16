/**
 * Vayu Admin — picking and uploading images.
 *
 * Photographs come off a camera at several megabytes; the storefront
 * never needs more than about 1600px, so the browser downsizes before the
 * upload rather than shipping the original and resizing on the server.
 */

import { api } from './api.js';
import { toast } from './dom.js';

const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.85;
const SKIP_UNDER = 200 * 1024;          // already small enough to send as-is
const PASS_THROUGH = ['image/svg+xml', 'image/gif']; // vector / animated: never re-encode

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/** Returns { name, data } ready to POST, downscaled to WebP when useful. */
export async function optimizeImage(file) {
    const asIs = async () => ({ name: file.name, data: await fileToDataUrl(file) });
    if (PASS_THROUGH.includes(file.type) || file.size < SKIP_UNDER) return asIs();

    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const data = canvas.toDataURL('image/webp', WEBP_QUALITY);
        // A browser without WebP encoding silently hands back a PNG, which
        // would be larger than the original — so only take it if it is WebP.
        if (data.startsWith('data:image/webp')) {
            return { name: file.name.replace(/\.[^.]+$/, '') + '.webp', data };
        }
    } catch { /* unreadable image: fall back to the untouched file */ }

    return asIs();
}

/** Prompts for a file and uploads it. Resolves to the URL, or null. */
export function pickImage() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return resolve(null);
            try {
                const { name, data } = await optimizeImage(file);
                const { url } = await api('upload', 'POST', { name, data });
                resolve(url);
            } catch (err) {
                toast(err.message, true);
                resolve(null);
            }
        };
        input.click();
    });
}

/** Prompts for a file and resolves to its text (used by the CSV import). */
export function pickTextFile(accept = '.csv,text/csv') {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = async () => {
            const file = input.files[0];
            resolve(file ? await file.text() : null);
        };
        input.click();
    });
}
