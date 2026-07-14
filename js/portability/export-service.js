// @ts-check
// =============================================================================
// TEXT EXPORT SERVICE
// One contract for JSON/CSV across Android and the browser. Native and modern
// browser saves resolve only after the destination confirms the write. The
// anchor fallback is explicitly reported as "started", never falsely "saved".
// =============================================================================

let callbackSeq = 0;

function runtimeDefaults() {
  return {
    window: typeof window !== 'undefined' ? window : undefined,
    document: typeof document !== 'undefined' ? document : undefined,
    URL: typeof URL !== 'undefined' ? URL : undefined,
    Blob: typeof Blob !== 'undefined' ? Blob : undefined,
    setTimeout: typeof setTimeout === 'function' ? setTimeout : undefined,
    clearTimeout: typeof clearTimeout === 'function' ? clearTimeout : undefined,
  };
}

function normalizedFile(file) {
  if (!file || typeof file !== 'object') return null;
  const filename = typeof file.filename === 'string' ? file.filename.trim() : '';
  const content = typeof file.content === 'string' ? file.content : '';
  const mime = typeof file.mime === 'string' && file.mime.trim()
    ? file.mime.trim()
    : 'text/plain';
  return filename ? { filename, content, mime } : null;
}

function nativeSave(file, runtime) {
  const win = runtime.window;
  const bridge = win?.HybridFileExportBridge;
  if (!bridge || typeof bridge.saveTextFile !== 'function') return null;
  if (!win.__fileExportCB) win.__fileExportCB = {};
  const callbackId = `file_${++callbackSeq}_${Date.now()}`;
  return new Promise((resolve) => {
    const finish = (result) => {
      runtime.clearTimeout?.(timer);
      delete win.__fileExportCB[callbackId];
      resolve({ ...result, adapter: 'android' });
    };
    const timer = runtime.setTimeout?.(() => {
      finish({ status: 'error', message: 'Android save timed out.' });
    }, 120000);
    win.__fileExportCB[callbackId] = (json) => {
      try {
        const result = JSON.parse(json || '{}');
        const status = ['saved', 'cancelled', 'error'].includes(result.status)
          ? result.status
          : 'error';
        finish({ status, message: result.message || null, filename: result.filename || file.filename });
      } catch {
        finish({ status: 'error', message: 'Android returned an invalid save result.' });
      }
    };
    try {
      bridge.saveTextFile(file.filename, file.content, file.mime, callbackId);
    } catch (error) {
      finish({ status: 'error', message: error instanceof Error ? error.message : 'Android save failed.' });
    }
  });
}

async function pickerSave(file, runtime) {
  const picker = runtime.window?.showSaveFilePicker;
  if (typeof picker !== 'function') return null;
  try {
    const handle = await picker({
      suggestedName: file.filename,
      types: [{ description: file.mime, accept: { [file.mime]: [`.${file.filename.split('.').pop()}`] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(file.content);
    await writable.close();
    return { status: 'saved', adapter: 'browser-picker', filename: file.filename };
  } catch (error) {
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      return { status: 'cancelled', adapter: 'browser-picker', filename: file.filename };
    }
    return { status: 'error', adapter: 'browser-picker', message: error instanceof Error ? error.message : 'Save failed.' };
  }
}

function downloadSave(file, runtime) {
  const doc = runtime.document;
  const Url = runtime.URL;
  const BlobCtor = runtime.Blob;
  if (!doc || !Url?.createObjectURL || !BlobCtor) {
    return { status: 'error', adapter: 'unavailable', message: 'File saving is unavailable.' };
  }
  const url = Url.createObjectURL(new BlobCtor([file.content], { type: `${file.mime};charset=utf-8` }));
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.hidden = true;
  doc.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  runtime.setTimeout?.(() => Url.revokeObjectURL(url), 0);
  return { status: 'started', adapter: 'browser-download', filename: file.filename };
}

/**
 * @param {{filename: string, content: string, mime: string}} file
 * @param {Partial<ReturnType<typeof runtimeDefaults>>} [providedRuntime]
 * @returns {Promise<{status: string, adapter: string, filename?: string, message?: string|null}>}
 */
export async function saveTextExport(file, providedRuntime = {}) {
  const normalized = normalizedFile(file);
  if (!normalized) return { status: 'error', adapter: 'unavailable', message: 'Invalid export file.' };
  const runtime = { ...runtimeDefaults(), ...providedRuntime };
  const native = nativeSave(normalized, runtime);
  if (native) return native;
  const picker = await pickerSave(normalized, runtime);
  if (picker) return picker;
  return downloadSave(normalized, runtime);
}

/** Honest user copy for each platform-confirmed outcome. */
export function exportResultMessage(result, label = 'Data') {
  if (result?.status === 'saved') return { message: `${label} exported ✓`, error: false };
  if (result?.status === 'started') return { message: 'Download started — check your Downloads folder.', error: false };
  if (result?.status === 'cancelled') return { message: 'Export cancelled.', error: false };
  return { message: result?.message || 'Export failed. Please try again.', error: true };
}
