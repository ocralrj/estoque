"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";

interface ExtractedData {
  title?: string;
  issuer?: string;
  issued_to?: string;
  issued_date?: string;
  expiry_date?: string | null;
  category?: string;
  description?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ExtractedData>({
    title: "",
    issuer: "",
    issued_to: "",
    issued_date: "",
    expiry_date: "",
    category: "",
    description: "",
  });

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    setError("");
    setAnalyzing(true);

    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/certificates/analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (data.extracted) {
        setForm({
          title: data.extracted.title || "",
          issuer: data.extracted.issuer || "",
          issued_to: data.extracted.issued_to || "",
          issued_date: data.extracted.issued_date || "",
          expiry_date: data.extracted.expiry_date || "",
          category: data.extracted.category || "",
          description: data.extracted.description || "",
        });
      }
    } catch {
      setError("Não foi possível analisar o arquivo automaticamente. Preencha manualmente.");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [], "image/*": [] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Selecione um arquivo."); return; }
    setUploading(true);
    setError("");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("metadata", JSON.stringify(form));

    const res = await fetch("/api/certificates/upload", { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Erro ao enviar certificado.");
      setUploading(false);
      return;
    }

    router.push("/dashboard/certificates");
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Enviar Certificado</h1>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6 ${
          isDragActive ? "border-primary-500 bg-primary-50" : "border-gray-300 hover:border-primary-400"
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div>
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            {analyzing && (
              <p className="text-sm text-primary-600 mt-2 animate-pulse">
                Analisando com Claude...
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-gray-600">Arraste o certificado aqui ou clique para selecionar</p>
            <p className="text-sm text-gray-400 mt-1">PDF, JPG, PNG — máx 10MB</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Dados do Certificado</h2>

        {[
          { name: "title", label: "Título *", type: "text", required: true },
          { name: "issuer", label: "Emissor *", type: "text", required: true },
          { name: "issued_to", label: "Emitido para *", type: "text", required: true },
          { name: "issued_date", label: "Data de emissão *", type: "date", required: true },
          { name: "expiry_date", label: "Data de validade", type: "date", required: false },
          { name: "category", label: "Categoria", type: "text", required: false },
        ].map((field) => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <input
              type={field.type}
              name={field.name}
              required={field.required}
              value={(form as Record<string, string | null | undefined>)[field.name] ?? ""}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <textarea
            name="description"
            rows={3}
            value={form.description ?? ""}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={uploading || analyzing || !file}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {uploading ? "Enviando..." : "Salvar Certificado"}
        </button>
      </form>
    </div>
  );
}
