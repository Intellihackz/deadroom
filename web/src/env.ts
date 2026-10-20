/**
 * Preview mode (VITE_PREVIEW=1 at build time): the public face of the site with every money feature switched off.
 * No wallet, no coffins list, no API calls. Used to put the frontend online before the backend exists.
 */
export const PREVIEW = import.meta.env.VITE_PREVIEW === "1";
