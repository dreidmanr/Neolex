import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import path from "node:path";
import type { DocumentFormat } from "./documentIntake";

const execFile = promisify(execFileCallback);
export const DOCUMENT_TEXT_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_EXTRACTION_TIMEOUT_MS = 15_000;

export type DocumentExtractionResult = Readonly<{
  status: "analyzed" | "manual_review_required" | "failed";
  text: string | null;
  textByteSize: number;
  securityFlags: readonly ("untrusted_document_content" | "instruction_like_content")[];
  failureCode: "protected_file" | "empty_text" | "extractor_error" | null;
}>;

function normalizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function containsInstructionLikeContent(text: string): boolean {
  return /(ignore\s+(all|previous)|system\s+prompt|developer\s+message|инструкц(ия|ии)\s+для\s+модел|игнорируй\s+(все|предыдущ))/i.test(text);
}

function resultFromText(text: string): DocumentExtractionResult {
  const normalized = normalizeText(text);
  if (!normalized) return {
    status: "manual_review_required",
    text: null,
    textByteSize: 0,
    securityFlags: ["untrusted_document_content"],
    failureCode: "empty_text",
  };
  const bytes = Buffer.byteLength(normalized, "utf8");
  if (bytes > DOCUMENT_TEXT_MAX_BYTES) return {
    status: "manual_review_required",
    text: null,
    textByteSize: bytes,
    securityFlags: ["untrusted_document_content"],
    failureCode: "extractor_error",
  };
  const flags: ("untrusted_document_content" | "instruction_like_content")[] = ["untrusted_document_content"];
  if (containsInstructionLikeContent(normalized)) flags.push("instruction_like_content");
  return {
    status: "analyzed",
    text: normalized,
    textByteSize: bytes,
    securityFlags: flags,
    failureCode: null,
  };
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/?>/gi, "\t")
    .replace(/<w:br\s*\/?>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export async function extractDocumentText(
  input: { format: DocumentFormat; bytes: Uint8Array },
  dependencies: { execute?: typeof execFile } = {},
): Promise<DocumentExtractionResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "lexy-doc-"));
  const sourcePath = path.join(dir, input.format === "pdf" ? "source.pdf" : "source.docx");
  try {
    await writeFile(sourcePath, input.bytes);
    if (input.format === "pdf") {
      const runner = dependencies.execute ?? execFile;
      try {
        const output = await runner("pdftotext", ["-enc", "UTF-8", "-layout", sourcePath, "-"], {
          timeout: DOCUMENT_EXTRACTION_TIMEOUT_MS,
          maxBuffer: DOCUMENT_TEXT_MAX_BYTES + 1024,
        });
        return resultFromText(output.stdout);
      } catch {
        return { status: "manual_review_required", text: null, textByteSize: 0, securityFlags: ["untrusted_document_content"], failureCode: "protected_file" };
      }
    }

    const runner = dependencies.execute ?? execFile;
    try {
      const output = await runner("unzip", ["-p", sourcePath, "word/document.xml"], {
        timeout: DOCUMENT_EXTRACTION_TIMEOUT_MS,
        maxBuffer: DOCUMENT_TEXT_MAX_BYTES + 1024,
      });
      return resultFromText(xmlToText(output.stdout));
    } catch {
      return { status: "manual_review_required", text: null, textByteSize: 0, securityFlags: ["untrusted_document_content"], failureCode: "protected_file" };
    }
  } catch {
    return { status: "failed", text: null, textByteSize: 0, securityFlags: ["untrusted_document_content"], failureCode: "extractor_error" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function readExtractedTextSafely(text: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lexy-doc-text-"));
  const filePath = path.join(dir, "content.txt");
  try {
    await writeFile(filePath, text, { encoding: "utf8", mode: 0o600 });
    return await readFile(filePath, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
