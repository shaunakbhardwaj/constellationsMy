import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFsPromises = {
  stat: vi.fn(),
  cp: vi.fn(),
  copyFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn()
}

vi.mock('fs', () => ({
  promises: mockFsPromises
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/home') }
}))

vi.mock('../../brain-path', () => ({
  getBrainDirectory: () => '/brain'
}))

vi.mock('../../ingestion', () => ({
  processFile: vi.fn()
}))

const mockLanceTable = {
  delete: vi.fn()
}

const mockLance = {
  openTable: vi.fn().mockResolvedValue(mockLanceTable)
}

const selectStatement = {
  get: vi.fn()
}

const deleteStatement = {
  run: vi.fn()
}

const mockDb = {
  prepare: vi.fn()
}

vi.mock('../../db', () => ({
  getSQLite: () => mockDb,
  getLanceDB: () => mockLance
}))

// Import after mocks
import { registerFileHandlers } from './files'

describe('delete-file IPC handler', () => {
  const handlers = new Map<string, (...args: any[]) => any>()

  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM files') && sql.includes('WHERE id = ?')) return selectStatement
      if (sql.includes('DELETE FROM files WHERE id = ?')) return deleteStatement
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    const ipcMain = {
      handle: (channel: string, handler: (...args: any[]) => any) => {
        handlers.set(channel, handler)
      }
    } as any

    registerFileHandlers(ipcMain)
  })

  it('returns error for invalid uuid', async () => {
    const handler = handlers.get('delete-file')
    expect(handler).toBeTypeOf('function')

    const response = await handler?.({}, 'not-a-uuid')
    expect(response).toEqual({ success: false, error: 'Invalid file id' })
    expect(mockDb.prepare).not.toHaveBeenCalled()
  })

  it('returns error when file does not exist', async () => {
    selectStatement.get.mockReturnValue(undefined)

    const handler = handlers.get('delete-file')!
    const response = await handler({}, '00000000-0000-4000-8000-000000000000')

    expect(response).toEqual({ success: false, error: 'File not found' })
    expect(selectStatement.get).toHaveBeenCalled()
  })

  it('returns error when file is processing', async () => {
    selectStatement.get.mockReturnValue({
      id: '00000000-0000-4000-8000-000000000000',
      path: '/brain/doc.txt',
      relativePath: 'doc.txt',
      indexedStatus: 'processing'
    })

    const handler = handlers.get('delete-file')!
    const response = await handler({}, '00000000-0000-4000-8000-000000000000')

    expect(response).toEqual({ success: false, error: 'File is currently being processed' })
    expect(deleteStatement.run).not.toHaveBeenCalled()
    expect(mockFsPromises.unlink).not.toHaveBeenCalled()
  })

  it('deletes lancedb vectors, sqlite record, and file on disk', async () => {
    selectStatement.get.mockReturnValue({
      id: '00000000-0000-4000-8000-000000000000',
      path: '/brain/doc.txt',
      relativePath: 'doc.txt',
      indexedStatus: 'indexed'
    })

    mockFsPromises.unlink.mockResolvedValue(undefined)
    deleteStatement.run.mockReturnValue({ changes: 1 })

    const handler = handlers.get('delete-file')!
    const response = await handler({}, '00000000-0000-4000-8000-000000000000')

    expect(response).toEqual({ success: true })
    expect(mockLance.openTable).toHaveBeenCalledWith('documents')
    expect(mockLanceTable.delete).toHaveBeenCalledWith("file_id = '00000000-0000-4000-8000-000000000000'")
    expect(deleteStatement.run).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000')
    expect(mockFsPromises.unlink).toHaveBeenCalledWith('/brain/doc.txt')
  })
})

