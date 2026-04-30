// SPA fallback: when a direct link like /bhajan/ENCODED_ID is opened,
// the static host serves this page, the SPA loads, and React Router
// reads window.location.pathname and shows the correct bhajan.
export { default } from './index';
