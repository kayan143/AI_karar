import axios from 'axios';
import { Loader2, Trash2 } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAppStore } from '../store';
import type { StudyDocument } from '../store';

const requestHeaders = { 'X-Requested-With': 'XMLHttpRequest' };
const fileTypes = {
  notes: '.pdf,.txt,.md',
  code: '.py,.java,.js,.ts,.tsx,.cc,.cpp,.c,.h,.hpp,.html,.css,.sql',
  data: '.csv,.json',
};

export interface DocumentShelfHandle {
  openFilePicker: (kind: keyof typeof fileTypes) => void;
}

function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const batchSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += batchSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + batchSize));
    }
    return btoa(binary);
  });
}

const DocumentShelf = forwardRef<DocumentShelfHandle>(function DocumentShelf(_props, ref) {
  const language = useAppStore((state) => state.language);
  const selectedIds = useAppStore((state) => state.selectedDocumentIds);
  const setSelectedIds = useAppStore((state) => state.setSelectedDocumentIds);
  const clearDocumentReferences = useAppStore((state) => state.clearDocumentReferences);
  const input = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const ar = language === 'ar';

  useImperativeHandle(ref, () => ({
    openFilePicker: (kind) => {
      if (!input.current) return;
      input.current.accept = fileTypes[kind];
      input.current.click();
    },
  }), []);

  useEffect(() => {
    let mounted = true;
    void axios.get<{ documents: StudyDocument[] }>('/api/documents', { headers: requestHeaders })
      .then(({ data }) => {
        if (!mounted) return;
        setDocuments(data.documents);
        const available = new Set(data.documents.map((document) => document.id));
        const currentSelected = useAppStore.getState().selectedDocumentIds;
        useAppStore.getState().setSelectedDocumentIds(currentSelected.filter((id) => available.has(id)));
      })
      .catch((cause: unknown) => {
        if (!mounted) return;
        const message = axios.isAxiosError(cause) ? cause.response?.data?.error : undefined;
        if (message && !/Sign in to access/.test(message)) {
          setError(typeof message === 'string' ? message : (ar ? 'تعذّر تحميل الملفات.' : 'Could not load files.'));
        }
      });
    return () => { mounted = false; };
  }, []);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      setNotice(ar
        ? `جارٍ تجهيز الملف ${index + 1} من ${files.length}...`
        : `Preparing file ${index + 1} of ${files.length}…`);
      try {
        const data = await fileToBase64(file);
        const response = await axios.post<{ document: StudyDocument }>('/api/documents', {
          name: file.name,
          data,
        }, { headers: requestHeaders });
        const { document } = response.data;
        setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
        setSelectedIds([...new Set([...useAppStore.getState().selectedDocumentIds, document.id])]);
      } catch (cause: unknown) {
        const message = axios.isAxiosError(cause) ? cause.response?.data?.error : undefined;
        failures.push(`${file.name}: ${typeof message === 'string' ? message : (ar ? 'تعذّرت معالجة الملف.' : 'Could not process this file.')}`);
      }
    }
    setError(failures.join(' '));
    setNotice(files.length > failures.length ? (ar ? 'تمت إضافة الملفات المحددة.' : 'Selected files added.') : '');
    setBusy(false);
  };

  const remove = async (document: StudyDocument) => {
    const confirmed = window.confirm(ar
      ? `حذف ${document.filename} وفهرسه المحلي؟`
      : `Delete ${document.filename} and its local search index?`);
    if (!confirmed) return;
    setError('');
    try {
      await axios.delete(`/api/documents/${encodeURIComponent(document.id)}`, { headers: requestHeaders });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      const currentStore = useAppStore.getState();
      currentStore.setSelectedDocumentIds(currentStore.selectedDocumentIds.filter((id) => id !== document.id));
      clearDocumentReferences(document.filename);
    } catch (cause: unknown) {
      const message = axios.isAxiosError(cause) ? cause.response?.data?.error : undefined;
      setError(typeof message === 'string' ? message : (ar ? 'تعذّر حذف الملف.' : 'Could not delete this file.'));
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        className="visually-hidden"
        multiple
        aria-label={ar ? 'اختر ملفات من جهازك' : 'Choose files from your device'}
        onChange={(event) => void upload(event)}
        disabled={busy}
      />
      {documents.length > 0 && (
        <ul className="document-list" aria-label={ar ? 'الملفات المرفقة' : 'Attached files'}>
          {documents.map((document) => (
            <li key={document.id}>
              <label title={document.filename}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(document.id)}
                  onChange={(event) => setSelectedIds(event.target.checked
                    ? [...new Set([...selectedIds, document.id])]
                    : selectedIds.filter((id) => id !== document.id))}
                />
                <span className="document-name">{document.filename}</span>
              </label>
              <button type="button" className="document-delete" onClick={() => void remove(document)} aria-label={`${ar ? 'حذف' : 'Delete'} ${document.filename}`}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(busy || notice) && <p className="document-status" role="status">{busy && <Loader2 size={12} className="document-spinner" />}{notice}</p>}
      {error && <p className="document-error" role="alert">{error}</p>}
    </>
  );
});

export default DocumentShelf;
