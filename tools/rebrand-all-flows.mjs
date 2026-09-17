import { readFile, writeFile } from "node:fs/promises";
const replacements = {
  "client/src/pages/PaidDiagnostic.tsx": [
    ["<div ref={topRef} className=\"min-h-screen bg-white\">", "<div ref={topRef} className=\"min-h-screen bg-[#f6f8fb] text-[#0b1b31]\">"],
    ["<header className=\"sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100\">", "<header className=\"sticky top-0 z-50 border-b border-white/10 bg-[#030b17]/95 text-white backdrop-blur-xl\">"],
    ["<div className=\"max-w-3xl mx-auto px-4 h-16 flex items-center justify-between\">", "<div className=\"mx-auto flex h-[66px] max-w-5xl items-center justify-between px-4\">"],
    ["className=\"flex items-center gap-2 text-gray-900 hover:opacity-70 transition-opacity\"", "className=\"flex items-center gap-3 text-white transition-opacity hover:opacity-80\""],
    ["className=\"w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center\"", "className=\"grid size-10 place-items-center rounded-xl bg-[#1677d2] shadow-lg shadow-blue-950/30\""],
    ["<span className=\"text-white font-bold text-xs\">N</span>", "<span className=\"text-white font-bold\">⚖</span>"],
    ["<span className=\"font-semibold text-sm\">Lexy</span>", "<span><span className=\"block text-lg font-bold leading-none\">Neolex</span><span className=\"mt-1 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400\">Legal Tech · Lexy</span></span>"],
    ["className=\"flex items-center gap-1.5 text-xs text-gray-400\"", "className=\"flex items-center gap-1.5 text-xs text-slate-400\""],
    ["className=\"h-full bg-gray-900 rounded-full transition-all duration-500\"", "className=\"h-full rounded-full bg-[#1677d2] transition-all duration-500\""],
    ["<div className=\"max-w-3xl mx-auto px-4 py-12\">", "<div className=\"mx-auto max-w-5xl px-4 py-12\">"],
    ["text-gray-900", "text-[#0b1b31]"], ["text-gray-600", "text-slate-500"], ["text-gray-700", "text-slate-600"], ["text-gray-500", "text-slate-500"], ["text-gray-400", "text-slate-400"],
    ["bg-gray-900 text-white", "bg-[#1677d2] text-white"], ["hover:bg-gray-800", "hover:bg-[#2189ed]"], ["border-gray-100", "border-slate-200"], ["bg-gray-50", "bg-[#eef4fa]"],
  ],
  "client/src/pages/Diagnostic.tsx": [
    ["<div className=\"min-h-screen bg-background flex flex-col\">", "<div className=\"min-h-screen bg-[#f6f8fb] text-[#0b1b31] flex flex-col\">"],
    ["bg-background/95", "bg-[#030b17]/95 text-white"], ["border-border", "border-white/10"], ["bg-primary", "bg-[#1677d2]"], ["text-primary", "text-[#1677d2]"],
  ],
  "client/src/pages/Results.tsx": [
    ["<div className=\"min-h-screen bg-background\">", "<div className=\"min-h-screen bg-[#f6f8fb] text-[#0b1b31]\">"],
    ["bg-background/95", "bg-[#030b17]/95 text-white"], ["border-border", "border-slate-200"], ["bg-primary", "bg-[#1677d2]"], ["text-primary", "text-[#1677d2]"],
  ],
  "client/src/pages/PaidResults.tsx": [
    ["<div className=\"min-h-screen bg-white\">", "<div className=\"min-h-screen bg-[#f6f8fb] text-[#0b1b31]\">"],
    ["<header className=\"sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100\">", "<header className=\"sticky top-0 z-50 border-b border-white/10 bg-[#030b17]/95 text-white backdrop-blur-xl\">"],
    ["text-gray-900", "text-[#0b1b31]"], ["bg-gray-900 text-white", "bg-[#1677d2] text-white"], ["hover:bg-gray-800", "hover:bg-[#2189ed]"], ["border-gray-100", "border-slate-200"],
  ],
};
for (const [path, pairs] of Object.entries(replacements)) {
  let text = await readFile(path, "utf8");
  for (const [from, to] of pairs) text = text.split(from).join(to);
  await writeFile(path, text);
  console.log(`updated ${path}`);
}
