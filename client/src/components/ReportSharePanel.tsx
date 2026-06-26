/**
 * ReportSharePanel — кнопки скачивания PDF и шаринга отчёта
 * Используется на страницах результатов бесплатной и платной диагностики
 */

import { useState } from "react";
import { Download, Share2, MessageCircle, Send, Copy, Check, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

interface ReportSharePanelProps {
  /** URL для скачивания PDF */
  pdfUrl: string;
  /** Тип отчёта */
  type: "free" | "paid";
  /** Категория риска для текста шаринга */
  riskLabel: string;
  /** Имя продукта (опционально) */
  productName?: string;
}

export function ReportSharePanel({ pdfUrl, type, riskLabel, productName }: ReportSharePanelProps) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const reportTitle = type === "free"
    ? "Экспресс-диагностика правовых рисков"
    : "Углублённая диагностика правовых рисков";

  const shareText = productName
    ? `Прошёл правовую диагностику IT-продукта «${productName}» через Lexy by Neolex. Категория риска: ${riskLabel}. Рекомендую проверить свой продукт.`
    : `Прошёл правовую диагностику IT-продукта через Lexy by Neolex. Категория риска: ${riskLabel}. Рекомендую проверить свой продукт.`;

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://neolex.ru";
  const shareUrl = `${siteUrl}/diagnostic`;

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error("Failed to fetch PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = type === "free" ? "neolex-free-report.pdf" : "neolex-paid-report.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Отчёт скачан");
    } catch {
      toast.error("Не удалось скачать отчёт. Попробуйте ещё раз.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  }

  const shareChannels = [
    {
      id: "telegram",
      label: "Telegram",
      icon: <Send className="w-4 h-4" />,
      color: "bg-[#0088cc] hover:bg-[#0077b5]",
      url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className="w-4 h-4" />,
      color: "bg-[#25d366] hover:bg-[#20b858]",
      url: `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`,
    },
    {
      id: "vk",
      label: "ВКонтакте",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.712-1.033-1.01-1.49-.99-1.744-.99-.356 0-.458.102-.458.593v1.563c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.253-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.762-.491h1.744c.525 0 .643.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.474-.085.712-.576.712z"/>
        </svg>
      ),
      color: "bg-[#4a76a8] hover:bg-[#3d6491]",
      url: `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`,
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold text-gray-900 text-sm">{reportTitle}</div>
          <div className="text-xs text-gray-400 mt-0.5">Сохраните или поделитесь результатами</div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed mb-3"
      >
        {downloading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Генерируем PDF...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Скачать PDF-отчёт
          </>
        )}
      </button>

      {/* Share toggle */}
      <button
        onClick={() => setShareOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 mb-3"
      >
        <Share2 className="w-4 h-4" />
        Поделиться результатами
      </button>

      {/* Share channels */}
      {shareOpen && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {shareChannels.map((ch) => (
              <a
                key={ch.id}
                href={ch.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-white text-xs font-medium transition-all duration-150 active:scale-[0.97] ${ch.color}`}
              >
                {ch.icon}
                {ch.label}
              </a>
            ))}
          </div>
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-all duration-150"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-green-600">Ссылка скопирована</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Скопировать ссылку на диагностику
              </>
            )}
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center mt-3 leading-relaxed">
        PDF формируется на сервере и может занять 5–15 секунд
      </p>
    </div>
  );
}
