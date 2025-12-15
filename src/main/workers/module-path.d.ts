/**
 * TypeScript declaration for electron-vite's ?modulePath import suffix.
 * This allows importing worker files and getting their bundled path.
 * @see https://electron-vite.org/guide/dev.html#worker-threads
 */
declare module '*?modulePath' {
  const workerPath: string
  export default workerPath
}
