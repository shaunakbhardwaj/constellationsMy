/// <reference types="vite/client" />

interface Window {
    electron: any
    api: {
        source: {
            ingestText: (params: any) => Promise<any>
            ingestPdf: (params: any) => Promise<any>
        }
        map: {
            generateCompression: (params: any) => Promise<any>
            expandNodeWithLens: (params: any) => Promise<any>
        }
        artifact: {
            createBranchBrief: (params: any) => Promise<any>
            listByDocument: (compressionMapId: string) => Promise<any>
        }
        handoff: {
            dispatchToCodex: (params: any) => Promise<any>
        }
        log: {
            event: (params: any) => Promise<any>
            recent: (limit?: number) => Promise<any>
            recentLLM: (limit?: number) => Promise<any>
        }
        memory: {
            list: () => Promise<any>
            get: (id: string) => Promise<any>
            create: (params: any) => Promise<any>
            update: (params: any) => Promise<any>
            delete: (id: string) => Promise<any>
        }
    }
}

interface ImportMetaEnv {
    readonly VITE_DEFAULT_MODEL: string
    readonly VITE_OPENROUTER_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
