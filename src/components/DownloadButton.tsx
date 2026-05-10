"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DownloadButton({
  certificateId,
  filePath,
  fileName,
}: {
  certificateId: string;
  filePath: string;
  fileName: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase.storage
      .from("certificates")
      .download(filePath);

    if (error || !data) {
      alert("Erro ao baixar o arquivo.");
      setLoading(false);
      return;
    }

    await fetch("/api/certificates/log-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificateId }),
    });

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? "Baixando..." : "Baixar Certificado"}
    </button>
  );
}
