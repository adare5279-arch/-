// Browser stub for Node built-ins (e.g. `fs`) that are statically imported by
// bundled libraries (hwp.js → cfb) but never actually invoked in the browser
// code path. Provides an inert default export so module resolution succeeds.
export default {};
