"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  source: {
    ingestText: (params) => electron.ipcRenderer.invoke("source:ingest-text", params),
    ingestPdf: (params) => electron.ipcRenderer.invoke("source:ingest-pdf", params)
  },
  map: {
    generateCompression: (params) => electron.ipcRenderer.invoke("map:generate-compression", params),
    expandNodeWithLens: (params) => electron.ipcRenderer.invoke("map:expand-node-with-lens", params)
  },
  artifact: {
    createBranchBrief: (params) => electron.ipcRenderer.invoke("artifact:create-branch-brief", params),
    listByDocument: (compressionMapId) => electron.ipcRenderer.invoke("artifact:list-by-document", { compressionMapId })
  },
  handoff: {
    dispatchToCodex: (params) => electron.ipcRenderer.invoke("handoff:dispatch-to-codex", params)
  },
  log: {
    event: (params) => electron.ipcRenderer.invoke("log:event", params),
    recent: (limit) => electron.ipcRenderer.invoke("log:recent", { limit }),
    recentLLM: (limit) => electron.ipcRenderer.invoke("log:recent-llm", { limit })
  },
  memory: {
    list: () => electron.ipcRenderer.invoke("memory:list"),
    get: (id) => electron.ipcRenderer.invoke("memory:get", { id }),
    create: (params) => electron.ipcRenderer.invoke("memory:create", params),
    update: (params) => electron.ipcRenderer.invoke("memory:update", params),
    delete: (id) => electron.ipcRenderer.invoke("memory:delete", { id })
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
