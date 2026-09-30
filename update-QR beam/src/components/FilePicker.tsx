import { useRef, useState, type DragEvent } from 'react';
import { IconUploadCloud, IconFile } from './Icons';

export default function FilePicker({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => ref.current?.click()}
      className={`group relative flex flex-col items-center justify-center p-8 sm:p-12 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden ${
        isDragging
          ? 'border-blue-600 bg-blue-50/70 scale-[1.01] shadow-lg shadow-blue-500/10'
          : 'border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/30 shadow-xs'
      }`}
    >
      <input
        ref={ref}
        type="file"
        className="sr-only"
        aria-label="Select a file to send"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-110 group-hover:bg-blue-100 group-hover:text-blue-700 transition-all duration-300 shadow-xs">
          <IconUploadCloud className="w-8 h-8" />
        </div>
      </div>

      <div className="text-center space-y-1.5 z-10">
        <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
          Choose a file or drag & drop here
        </h3>
        <p className="text-sm text-slate-500 max-w-sm m-0">
          Any format: images, video, documents, archives, or binary data. Transferred optically with SHA-256 verification.
        </p>
      </div>

      <div className="mt-5 flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 group-hover:border-blue-300 group-hover:text-blue-700 transition-all shadow-2xs">
        <IconFile className="w-3.5 h-3.5 text-blue-600" />
        Browse local storage
      </div>
    </div>
  );
}
