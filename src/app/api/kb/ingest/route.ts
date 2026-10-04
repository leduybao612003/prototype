import { readFile } from "node:fs/promises";
import path from "node:path";
import { getKbStatus, ingestPdf } from "@/lib/kbStore";
import { SAMPLE_DOC_ID } from "@/lib/seed";

export const runtime = "nodejs";

// GET /api/kb/status — trạng thái từng stage + cờ ready.
export async function GET() {
  return Response.json(await getKbStatus());
}

// POST /api/kb/ingest — nạp PDF vào KB.
// Body: multipart {file} hoặc JSON {sample:true} để nạp public/sample.pdf.
// Chống trùng bằng sha256 (nạp lại cùng file không tạo dữ liệu trùng).
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let bytes: Uint8Array;
  let filename: string;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json({ code: "NO_FILE", message: "Thiếu trường file." }, { status: 400 });
      }
      if (file.size === 0) {
        return Response.json({ code: "EMPTY_FILE", message: "File rỗng." }, { status: 400 });
      }
      filename = file.name || "upload.pdf";
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = await req.json().catch(() => null);
      if (!body || body.sample !== true) {
        return Response.json(
          { code: "INVALID_BODY", message: 'Gửi multipart {file} hoặc JSON {sample:true}.' },
          { status: 400 },
        );
      }
      filename = "sample.pdf";
      const buf = await readFile(path.join(process.cwd(), "public", "sample.pdf"));
      bytes = new Uint8Array(buf);
    }
  } catch (e) {
    return Response.json(
      { code: "UPLOAD_FAILED", message: e instanceof Error ? e.message : "Đọc upload thất bại." },
      { status: 500 },
    );
  }

  try {
    const { status, deduped } = await ingestPdf(bytes, filename, SAMPLE_DOC_ID);
    return Response.json({ ...status, deduped }, { status: status.ready ? 200 : 500 });
  } catch (e) {
    return Response.json(
      {
        code: "INGEST_FAILED",
        stage: "unknown",
        message: e instanceof Error ? e.message : "Ingestion thất bại.",
      },
      { status: 500 },
    );
  }
}
