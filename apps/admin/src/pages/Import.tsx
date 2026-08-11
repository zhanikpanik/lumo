import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { FileSpreadsheet } from 'lucide-react';

export function Import() {
 const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
 const [fileName, setFileName] = useState<string | null>(null);

 const onDrop = useCallback((accepted: File[]) => {
  const file = accepted[0];
  if (!file) return;
  setFileName(file.name);
  const reader = new FileReader();
  reader.onload = (e) => {
   const data = new Uint8Array(e.target?.result as ArrayBuffer);
   const wb = XLSX.read(data, { type: 'array' });
   const sheet = wb.Sheets[wb.SheetNames[0]];
   const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false }) as string[][];
   if (!matrix.length) {
    setPreview(null);
    return;
   }
   const headers = (matrix[0] || []).map((c) => String(c ?? ''));
   const rows = matrix.slice(1, 11).map((r) => r.map((c) => String(c ?? '')));
   setPreview({ headers, rows });
  };
  reader.readAsArrayBuffer(file);
 }, []);

 const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop,
  accept: {
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
   'application/vnd.ms-excel': ['.xls'],
  },
  maxFiles: 1,
 });

 return (
  <div className="p-8 max-w-3xl">
   <h2 className="text-2xl font-bold mb-2">Импорт из Poster</h2>
   <p className="text-sm text-muted-foreground mb-6">
    Загрузите экспорт (.xlsx). Ниже — предпросмотр первых строк. Сопоставление колонок с{' '}
    <code className="text-xs bg-muted px-1 rounded">categories</code> /{' '}
    <code className="text-xs bg-muted px-1 rounded">products</code> будет добавлено в следующей
    итерации.
   </p>

   <div
    {...getRootProps()}
    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
     isDragActive ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/40'
    }`}
   >
    <input {...getInputProps()} />
    <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
    <p className="text-sm font-medium">
     {isDragActive ? 'Отпустите файл…' : 'Перетащите .xlsx сюда или нажмите для выбора'}
    </p>
    {fileName && <p className="text-xs text-muted-foreground mt-2">{fileName}</p>}
   </div>

   {preview && (
    <div className="mt-8 overflow-x-auto border rounded-lg">
     <table className="table-fixed border-separate border-spacing-0 w-full">
      <thead className="sticky top-0 z-10 bg-background">
       <tr className="bg-muted/50">
        {preview.headers.map((h, i) => (
         <th key={i} className="text-left py-1.5 font-semibold">
          {h || `Col ${i + 1}`}
         </th>
        ))}
       </tr>
      </thead>
      <tbody>
       {preview.rows.map((row, ri) => (
        <tr key={ri} className="even:bg-muted/20">
         {preview.headers.map((_, ci) => (
          <td key={ci} className="py-1.5">
           {row[ci] ?? ''}
          </td>
         ))}
        </tr>
       ))}
      </tbody>
     </table>
     <p className="text-xs text-muted-foreground p-2">Показаны до 10 строк данных.</p>
    </div>
   )}

   <div className="mt-6">
    <button
     type="button"
     disabled
     className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold cursor-not-allowed"
    >
     Запустить импорт (скоро)
    </button>
   </div>
  </div>
 );
}
