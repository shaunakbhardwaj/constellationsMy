import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'
import { getSQLite } from './db'
import { processFile } from './ingestion'

type FileInDB = {
  path: string
  modifiedAt: number
}

export async function scanBrainDirectory(brainDir: string): Promise<void> {
  console.log('[Scanner] Starting initial scan...')

  const db = getSQLite()

  // Fetch existing records so we can diff against disk
  const trackedFiles = db.prepare<[], FileInDB>('SELECT path, modified_at as modifiedAt FROM files').all()
  const trackedMap = new Map(trackedFiles.map((file) => [file.path, file.modifiedAt]))

  const filesOnDisk = await scanDirectory(brainDir)

  let newFiles = 0
  let updatedFiles = 0

  for (const diskPath of filesOnDisk) {
    const relativePath = relative(brainDir, diskPath)
    const stats = await stat(diskPath)
    const diskModified = Math.floor(stats.mtimeMs)

    const dbModified = trackedMap.get(diskPath)

    if (!dbModified) {
      console.log(`[Scanner] New file: ${relativePath}`)
      await processFile(diskPath, relativePath)
      newFiles++
    } else if (diskModified > dbModified) {
      console.log(`[Scanner] Modified file: ${relativePath}`)
      await processFile(diskPath, relativePath)
      updatedFiles++
    }

    trackedMap.delete(diskPath)
  }

  // Remaining entries exist in DB but not on disk
  for (const [deletedPath] of trackedMap) {
    const relativePath = relative(brainDir, deletedPath)
    console.log(`[Scanner] Deleted file: ${relativePath}`)
    db.prepare('DELETE FROM files WHERE path = ?').run(deletedPath)
  }

  console.log(`[Scanner] Scan complete. New: ${newFiles}, Updated: ${updatedFiles}, Deleted: ${trackedMap.size}`)
}

async function scanDirectory(dir: string, depth = 0): Promise<string[]> {
  const MAX_SCAN_DEPTH = 20

  if (depth > MAX_SCAN_DEPTH) {
    console.warn(`[Scanner] Max depth (${MAX_SCAN_DEPTH}) reached at: ${dir}`)
    return []
  }

  const results: string[] = []

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      // Skip hidden files, DBs, system folders, and symlinks (prevent loops)
      if (
        entry.name.startsWith('.') ||
        entry.name.endsWith('.db') ||
        entry.name.endsWith('.db-journal') ||
        entry.name === 'lance' ||
        entry.name === 'node_modules' ||
        entry.isSymbolicLink()
      ) {
        continue
      }

      if (entry.isDirectory()) {
        const nested = await scanDirectory(fullPath, depth + 1)
        results.push(...nested)
      } else if (entry.isFile()) {
        results.push(fullPath)
      }
    }
  } catch (err) {
    console.error(`[Scanner] Error scanning ${dir}:`, err)
  }

  return results
}
