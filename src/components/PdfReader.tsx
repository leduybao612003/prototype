"use client";

// PDF reader thật bằng PDF.js: canvas + text layer chọn được chữ + annotation overlay
// vector (SVG) theo hệ tọa độ chuẩn hóa 0..1 độc lập zoom. Toolbar bám đúng 7 ảnh
// tham khảo: Đọc/chọn chữ, Viết tay, Tô sáng, Khoanh vùng, Tẩy, Hoàn tác, Xóa trang.
// Hai chế độ: "single" (từng slide) và "continuous" (cuộn dọc nhiều slide nối tiếp,
// virtualize — chỉ render canvas/text/annotation các trang trong cửa sổ đọc ±2).

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { ItemKind, LearningItem } from "@/lib/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export type ReaderTool = "read" | "write" | "highlight" | "region" | "erase";

export interface Quad {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnnotationPayload {
  quote?: string;
  quads?: Quad[];
  vectorData?: unknown;
  geometry?: unknown;
  body?: string;
}

// Đích khoanh vùng + nguồn đã chốt lúc BẮT ĐẦU khoanh (không dùng trang mở sau).
export type RegionDest = "notes" | "ai" | "support";

export interface RegionContext {
  courseId: string;
  chapterId: string;
  lessonId: string;
  partId: string;
  documentId?: string;
  docVersion: string;
}

export interface RegionCrop {
  sid: number;
  rect: { x: number; y: number; w: number; h: number };
  crop: string; // crop 640px cho composer AI
  cropSmall: string; // crop 480px lưu vào note
  pageNumber: number;
}

export type ReaderView = "single" | "continuous";

interface PdfReaderProps {
  url: string;
  page: number;
  onPageChange: (p: number) => void;
  pageItems: LearningItem[];
  onCommit: (kind: ItemKind, payload: AnnotationPayload, pageNumber: number) => string;
  onErase: (id: string) => void;
  onClearPage: () => void;
  dark: boolean;
  viewMode: ReaderView;
  onViewModeChange: (m: ReaderView) => void;
  // Điều hướng từ Mở nguồn / thumbnail trong chế độ cuộn dọc.
  jumpPage: { page: number; nonce: number } | null;
  // Đích khoanh hiện tại (tab panel) + context nguồn; toolbar chọn đích rõ.
  regionTab: RegionDest;
  regionCtx: RegionContext;
  onSelectDestTab: (t: RegionDest) => void;
  // Session khoanh: start trả sid (chống trùng khi retry), finish gửi crop.
  onRegionStart: (pageNumber: number) => number;
  onRegionFinish: (crop: RegionCrop) => void;
}

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

const INK_COLORS = ["#1d4ed8", "#111111", "#dc2626"];
const INK_WIDTHS = [2, 4];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

type PdfDoc = { getPage: (n: number) => Promise<unknown>; numPages: number };

export default function PdfReader(props: PdfReaderProps) {
  const {
    url,
    page,
    onPageChange,
    pageItems,
    onCommit,
    onErase,
    onClearPage,
    dark,
    viewMode,
    onViewModeChange,
    jumpPage,
    regionTab,
    onSelectDestTab,
  } = props;
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<ReaderTool>("read");
  const [thumbs, setThumbs] = useState(false);
  const [inkColor, setInkColor] = useState(INK_COLORS[0]);
  const [inkWidth, setInkWidth] = useState(INK_WIDTHS[0]);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [doc, setDoc] = useState<PdfDoc | null>(null);

  const docRef = useRef<PdfDoc | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const scrollTick = useRef(false);

  // Nạp tài liệu (1 lần theo url; parent remount qua key khi đổi tài liệu).
  useEffect(() => {
    let alive = true;
    const task = pdfjsLib.getDocument({ url });
    task.promise.then(
      (pdf) => {
        if (!alive) return;
        const d = pdf as unknown as PdfDoc;
        docRef.current = d;
        setDoc(d);
        setNumPages(d.numPages);
      },
      () => {
        if (alive)
          setLoadError(
            "Chưa tải được PDF. Up file mẫu vào public/sample.pdf rồi tải lại trang.",
          );
      },
    );
    return () => {
      alive = false;
      task.destroy().catch(() => undefined);
      docRef.current = null;
    };
  }, [url]);

  // Preload kích thước mọi trang (viewport scale 1) cho placeholder cuộn dọc.
  useEffect(() => {
    const pdf = docRef.current;
    if (!pdf || numPages === 0) return;
    let alive = true;
    (async () => {
      const out: Record<number, { w: number; h: number }> = {};
      for (let n = 1; n <= numPages; n++) {
        try {
          const pg = (await pdf.getPage(n)) as {
            getViewport: (o: { scale: number }) => { width: number; height: number };
          };
          const vp = pg.getViewport({ scale: 1 });
          out[n] = { w: vp.width, h: vp.height };
        } catch {
          /* bỏ qua trang lỗi */
        }
        if (!alive) return;
      }
      if (alive) setSizes(out);
    })();
    return () => {
      alive = false;
    };
  }, [numPages, url]);

  // Kẹp trang khi tài liệu đổi.
  useEffect(() => {
    if (numPages > 0 && page > numPages) onPageChange(numPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  // Chuyển chế độ giữ slide hiện tại: sang cuộn dọc thì cuộn tới đúng slide.
  function scrollToPage(n: number) {
    const el = pageEls.current.get(n);
    const sc = scrollerRef.current;
    if (el && sc) {
      const r = el.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      sc.scrollTo({ top: sc.scrollTop + (r.top - sr.top) - 8, behavior: "smooth" });
    } else {
      onPageChange(clamp(n, 1, numPages || 1));
    }
  }

  useEffect(() => {
    if (viewMode !== "continuous" || !jumpPage || jumpPage.page < 1) {
      if (viewMode === "continuous") scrollToPage(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // jumpPage từ Mở nguồn / bên ngoài.
  useEffect(() => {
    if (!jumpPage) return;
    if (viewMode === "continuous") {
      // Đợi placeholder render rồi cuộn.
      const t = setTimeout(() => {
        scrollToPage(jumpPage.page);
        onPageChange(clamp(jumpPage.page, 1, numPages || 1));
      }, 60);
      return () => clearTimeout(t);
    }
    onPageChange(clamp(jumpPage.page, 1, numPages || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpPage?.nonce]);

  function onScrollContinuous() {
    if (scrollTick.current) return;
    scrollTick.current = true;
    requestAnimationFrame(() => {
      scrollTick.current = false;
      const sc = scrollerRef.current;
      if (!sc) return;
      const sr = sc.getBoundingClientRect();
      let cur = 1;
      for (let n = 1; n <= numPages; n++) {
        const el = pageEls.current.get(n);
        if (el && el.getBoundingClientRect().top - sr.top <= 120) cur = n;
        else break;
      }
      if (cur !== page) onPageChange(cur);
    });
  }

  function commit(kind: ItemKind, payload: AnnotationPayload, pageNumber: number) {
    const id = onCommit(kind, payload, pageNumber);
    setUndoStack((s) => [...s, id]);
    return id;
  }

  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    onErase(last);
  }

  function pickThumb(n: number) {
    if (viewMode === "continuous") {
      scrollToPage(n);
      onPageChange(clamp(n, 1, numPages || 1));
    } else {
      onPageChange(n);
    }
  }

  // Phím tắt: Ctrl/Cmd+Z hoàn tác khi đang annotate; ←/→ chuyển trang ở chế độ đọc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        undo();
      } else if (e.key === "ArrowRight" && !typing && tool === "read") {
        onPageChange(Math.min(numPages || page + 1, page + 1));
      } else if (e.key === "ArrowLeft" && !typing && tool === "read") {
        onPageChange(Math.max(1, page - 1));
      } else if (e.key === "Escape") {
        setTool("read");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, numPages, page]);

  const toolBtn = (m: ReaderTool, label: string, icon: React.ReactNode) => (
    <button
      key={m}
      onClick={() => setTool(m)}
      title={label}
      aria-label={label}
      aria-pressed={tool === m}
      style={{
        ...tbtn(dark),
        borderColor: tool === m ? "#187CFA" : undefined,
        background: tool === m ? (dark ? "#1f3a52" : "#E3F0FE") : tbtn(dark).background,
      }}
    >
      {icon}
    </button>
  );

  const destBtn = (d: RegionDest, label: string) => (
    <button
      key={d}
      onClick={() => onSelectDestTab(d)}
      title={`Vùng khoanh sẽ vào: ${label}`}
      aria-label={`Vùng khoanh sẽ vào: ${label}`}
      aria-pressed={regionTab === d}
      style={{
        ...tbtn(dark),
        fontSize: 12,
        borderColor: regionTab === d ? "#187CFA" : undefined,
        background: regionTab === d ? (dark ? "#1f3a52" : "#E3F0FE") : tbtn(dark).background,
        fontWeight: regionTab === d ? 700 : 400,
      }}
    >
      {label}
    </button>
  );

  const itemsFor = (n: number) =>
    pageItems.filter(
      (i) => (i.source.pageNumber ?? 0) === n && (i.kind === "ink" || i.kind === "highlight" || i.kind === "region"),
    );

  return (
    <div ref={rootRef}>
      {/* Thanh điều hướng trên (theo ảnh: zoom, tìm, trang, thumbnail) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setZoom((z) => clamp(Math.round((z - 0.25) * 100) / 100, 0.5, 3))} title="Thu nhỏ" aria-label="Thu nhỏ" style={tbtn(dark)}>−</button>
        <span style={{ fontSize: 13, minWidth: 48, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => clamp(Math.round((z + 0.25) * 100) / 100, 0.5, 3))} title="Phóng to" aria-label="Phóng to" style={tbtn(dark)}>+</button>
        <button onClick={() => setZoom(1)} title="Đặt lại zoom" aria-label="Đặt lại zoom" style={tbtn(dark)}>⤾</button>
        <FindBox
          dark={dark}
          getDoc={() => docRef.current}
          numPages={numPages}
          onPick={pickThumb}
        />
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }} role="group" aria-label="Chế độ đọc">
          <button
            onClick={() => onViewModeChange("single")}
            aria-pressed={viewMode === "single"}
            title="Đọc từng slide"
            style={{ ...tbtn(dark), fontSize: 12, fontWeight: viewMode === "single" ? 700 : 400, borderColor: viewMode === "single" ? "#187CFA" : undefined }}
          >
            Từng slide
          </button>
          <button
            onClick={() => onViewModeChange("continuous")}
            aria-pressed={viewMode === "continuous"}
            title="Cuộn dọc nhiều slide nối tiếp"
            style={{ ...tbtn(dark), fontSize: 12, fontWeight: viewMode === "continuous" ? 700 : 400, borderColor: viewMode === "continuous" ? "#187CFA" : undefined }}
          >
            Cuộn dọc
          </button>
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => pickThumb(Math.max(1, page - 1))} title="Slide trước" aria-label="Slide trước" style={{ ...tbtn(dark), fontSize: 13, minWidth: 90 }}>
          ‹ Slide trước
        </button>
        <input
          value={page}
          min={1}
          max={numPages || 1}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) pickThumb(clamp(Math.floor(v), 1, numPages || 1));
          }}
          aria-label="Số trang"
          style={{ ...tinput(dark), width: 52, textAlign: "center" }}
        />
        <span style={{ fontSize: 13 }}>/ {numPages || "…"}</span>
        <button onClick={() => pickThumb(numPages ? Math.min(numPages, page + 1) : page + 1)} title="Slide sau" aria-label="Slide sau" style={{ ...tbtn(dark), fontSize: 13, minWidth: 80 }}>
          Slide sau ›
        </button>
        <button onClick={() => setThumbs((v) => !v)} title="Ảnh thu nhỏ các trang" aria-label="Ảnh thu nhỏ" aria-pressed={thumbs} style={tbtn(dark)}>▦</button>
        <button onClick={() => rootRef.current?.requestFullscreen?.().catch(() => undefined)} title="Toàn màn hình" aria-label="Toàn màn hình" style={tbtn(dark)}>⛶</button>
      </div>

      {/* Toolbar annotation (đúng 7 nút trong ảnh tham khảo) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }} role="toolbar" aria-label="Công cụ ghi chú trên PDF">
        {toolBtn("read", "Đọc và chọn chữ", <SvgCursor />)}
        {toolBtn("write", "Viết tay trực tiếp lên PDF", <SvgPen />)}
        {toolBtn("highlight", "Chọn chữ để tô sáng", <SvgMarker />)}
        {toolBtn("region", "Khoanh vùng chưa hiểu bằng nét bút", <SvgCircle />)}
        {toolBtn("erase", "Tẩy nét viết, highlight hoặc vùng khoanh", <SvgEraser />)}
        <button onClick={undo} title="Hoàn tác nét cuối trên trang hiện tại (Ctrl/Cmd+Z)" aria-label="Hoàn tác" style={tbtn(dark)}>↩</button>
        <button onClick={onClearPage} title="Xóa annotation trên trang hiện tại" aria-label="Xóa annotation trang" style={tbtn(dark)}>🗑</button>
        {tool === "region" && (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }} role="group" aria-label="Đích của vùng khoanh">
            <span style={{ opacity: 0.75 }}>Vùng khoanh sẽ vào:</span>
            {destBtn("notes", "Lưu vào ghi chú")}
            {destBtn("ai", "Hỏi trợ giảng")}
            {destBtn("support", "Yêu cầu hỗ trợ")}
          </span>
        )}
        {tool === "write" && (
          <WriteOpts dark={dark} inkColor={inkColor} setInkColor={setInkColor} inkWidth={inkWidth} setInkWidth={setInkWidth} />
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {thumbs && (
          <ThumbStrip
            getPage={(n: number) =>
              (docRef.current as unknown as { getPage: (n: number) => Promise<unknown> })?.getPage(n)
            }
            numPages={numPages}
            page={page}
            onPick={pickThumb}
            dark={dark}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loadError ? (
            <div
              style={{
                background: dark ? "#16212c" : "#FFFFFF",
                border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                borderRadius: 12,
                padding: 24,
                fontSize: 14,
              }}
            >
              <p>{loadError}</p>
              <p style={{ fontSize: 13, opacity: 0.8 }}>
                File cần đặt tại <code>public/sample.pdf</code> trong project (đã nối sẵn).
              </p>
            </div>
          ) : viewMode === "single" ? (
            <PageView
              doc={doc}
              pageNum={page}
              zoom={zoom}
              tool={tool}
              items={itemsFor(page)}
              active
              size={sizes[page]}
              dark={dark}
              inkColor={inkColor}
              inkWidth={inkWidth}
              commit={(kind, payload) => commit(kind, payload, page)}
              onErase={onErase}
              onRegionStart={() => props.onRegionStart(page)}
              onRegionFinish={props.onRegionFinish}
              registerEl={undefined}
            />
          ) : (
            <div
              ref={scrollerRef}
              onScroll={onScrollContinuous}
              aria-label="Cuộn dọc các slide"
              style={{ overflowY: "auto", maxHeight: "calc(100vh - 300px)", minHeight: 320, paddingRight: 4 }}
            >
              {Array.from({ length: numPages }, (_, k) => k + 1).map((n) => (
                <PageView
                  key={n}
                  doc={doc}
                  pageNum={n}
                  totalPages={numPages}
                  zoom={zoom}
                  tool={tool}
                  items={itemsFor(n)}
                  active={Math.abs(n - page) <= 2}
                  size={sizes[n]}
                  dark={dark}
                  inkColor={inkColor}
                  inkWidth={inkWidth}
                  commit={(kind, payload) => commit(kind, payload, n)}
                  onErase={onErase}
                  onRegionStart={() => props.onRegionStart(n)}
                  onRegionFinish={props.onRegionFinish}
                  registerEl={(el) => {
                    if (el) pageEls.current.set(n, el);
                    else pageEls.current.delete(n);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Một trang PDF: canvas + text layer + overlay vector. Tọa độ chuẩn hóa 0..1
// theo từng trang nên scroll/zoom/resize không lệch annotation.
function PageView({
  doc,
  pageNum,
  totalPages,
  zoom,
  tool,
  items,
  active,
  size,
  dark,
  inkColor,
  inkWidth,
  commit,
  onErase,
  onRegionStart,
  onRegionFinish,
  registerEl,
}: {
  doc: PdfDoc | null;
  pageNum: number;
  totalPages?: number;
  zoom: number;
  tool: ReaderTool;
  items: LearningItem[];
  active: boolean;
  size?: { w: number; h: number };
  dark: boolean;
  inkColor: string;
  inkWidth: number;
  commit: (kind: ItemKind, payload: AnnotationPayload) => string;
  onErase: (id: string) => void;
  onRegionStart: () => number;
  onRegionFinish: (crop: RegionCrop) => void;
  registerEl?: (el: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragSid = useRef<number | null>(null);
  const dragRectRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const finishRef = useRef(onRegionFinish);
  useEffect(() => {
    finishRef.current = onRegionFinish;
  });
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [dragRect, setDragRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Render trang khi vào cửa sổ đọc (virtualize).
  useEffect(() => {
    let alive = true;
    if (!active || !doc || !canvasRef.current || !textRef.current) return;
    doc
      .getPage(pageNum)
      .then(async (raw) => {
        if (!alive) return;
        const pg = raw as {
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: unknown) => { promise: Promise<void> };
          getTextContent: () => Promise<{ items: unknown[] }>;
        };
        const viewport = pg.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        try {
          await pg.render({ canvasContext: ctx, viewport }).promise;
        } catch {
          if (alive) return;
          return;
        }
        if (!alive) return;
        // Text layer thủ công: span trong suốt, chọn được chữ (F07).
        const tc = await pg.getTextContent().catch(() => null);
        const layer = textRef.current;
        if (!layer || !tc) return;
        layer.innerHTML = "";
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
        const pdfjsUtil = (pdfjsLib as unknown as {
          Util: { transform: (a: number[], b: number[]) => number[] };
        }).Util;
        const vp = pg.getViewport({ scale: zoom }) as unknown as { transform: number[] };
        for (const rawIt of tc.items) {
          const it = rawIt as { str: string; transform: number[]; width: number; height: number };
          if (!it.str) continue;
          const tx = pdfjsUtil.transform(vp.transform, it.transform);
          const fontH = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
          if (fontH <= 0) continue;
          const span = document.createElement("span");
          span.textContent = it.str;
          span.style.left = `${tx[4]}px`;
          span.style.top = `${tx[5] - fontH}px`;
          span.style.fontSize = `${fontH}px`;
          span.style.fontFamily = "sans-serif";
          layer.appendChild(span);
          const expected = it.width * zoom;
          const actual = span.offsetWidth;
          if (actual > 0 && expected > 0) {
            const sx = expected / actual;
            if (Number.isFinite(sx) && sx > 0.2 && sx < 5) {
              span.style.transform = `scaleX(${sx})`;
              span.style.transformOrigin = "left top";
            }
          }
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active, doc, pageNum, zoom]);

  function toFrac(e: React.PointerEvent | React.MouseEvent) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: clamp((e.clientX - box.left) / box.width, 0, 1),
      y: clamp((e.clientY - box.top) / box.height, 0, 1),
    };
  }

  // Cắt đúng vùng rect từ canvas trang, thu theo maxSize (note 480 / AI 640).
  function cropSized(r: Quad, maxSize: number): string | null {
    try {
      const canvas = canvasRef.current;
      if (!canvas || canvas.width < 8 || canvas.height < 8) return null;
      const sx = Math.floor(r.x * canvas.width);
      const sy = Math.floor(r.y * canvas.height);
      const sw = Math.max(1, Math.floor(r.w * canvas.width));
      const sh = Math.max(1, Math.floor(r.h * canvas.height));
      if (sx + sw <= 0 || sy + sh <= 0 || sx >= canvas.width || sy >= canvas.height) return null;
      const scale = Math.min(1, maxSize / Math.max(sw, sh));
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.floor(sw * scale));
      out.height = Math.max(1, Math.floor(sh * scale));
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
      const url = out.toDataURL("image/jpeg", 0.65);
      return url.length > 1_000_000 ? null : url;
    } catch {
      return null;
    }
  }

  function finishRegion() {
    if (!dragStart.current || dragSid.current == null) return;
    const r = normRect(dragRectRef.current ?? { x0: 0, y0: 0, x1: 0, y1: 0 });
    const sid = dragSid.current;
    dragStart.current = null;
    dragSid.current = null;
    dragRectRef.current = null;
    setDragRect(null);
    if (r.w <= 0.01 || r.h <= 0.01) return;
    const crop = cropSized(r, 640);
    const cropSmall = cropSized(r, 480);
    if (!crop || !cropSmall) return;
    finishRef.current({ sid, rect: r, crop, cropSmall, pageNumber: pageNum });
  }

  // Kết thúc khoanh qua window pointerup: bắt được cả khi thả chuột ngoài
  // trang (kể cả khi user đổi tab giữa chừng) — không kẹt drag, không trùng.
  // Listener gắn 1 lần, đọc state qua ref + callback tươi nhất (tránh closure
  // cũ giữ tab đã đổi — đây chính là điều kiện kích hoạt hộp xác nhận đích).
  useEffect(() => {
    const up = () => finishRegion();
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (tool === "write") {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const p = toFrac(e);
      setDrawing({ points: [p], color: inkColor, width: inkWidth });
    } else if (tool === "region") {
      const p = toFrac(e);
      dragStart.current = p;
      dragSid.current = onRegionStart();
      dragRectRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      setDragRect(dragRectRef.current);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (tool === "write" && drawing) {
      setDrawing({ ...drawing, points: [...drawing.points, toFrac(e)] });
    } else if (tool === "region" && dragStart.current) {
      const p = toFrac(e);
      dragRectRef.current = { x0: dragStart.current.x, y0: dragStart.current.y, x1: p.x, y1: p.y };
      setDragRect(dragRectRef.current);
    }
  }

  // Viết tay commit khi nhấc bút (F08). Region kết thúc qua window pointerup.
  function onPointerUp() {
    if (tool === "write" && drawing && drawing.points.length > 1) {
      commit("ink", { vectorData: { strokes: [drawing] } });
    }
    setDrawing(null);
  }

  // Highlight từ vùng chọn chữ của đúng trang này (F09).
  function onMouseUp() {
    if (tool !== "highlight") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const quads: Quad[] = [];
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      if (!containerRef.current.contains(range.commonAncestorContainer)) continue;
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1 || r.height < 1) continue;
        quads.push({
          x: (r.left - box.left) / box.width,
          y: (r.top - box.top) / box.height,
          w: r.width / box.width,
          h: r.height / box.height,
        });
      }
    }
    const quote = sel.toString().trim();
    sel.removeAllRanges();
    if (quads.length > 0 && quote) commit("highlight", { quote, quads });
  }

  if (!active) {
    const h = size ? Math.max(200, size.h * zoom) : 900;
    const w = size ? size.w * zoom : undefined;
    return (
      <div
        ref={registerEl}
        data-page={pageNum}
        aria-label={`Trang ${pageNum} (chưa tải)`}
        style={{
          height: h,
          maxWidth: w,
          margin: "0 auto 12px",
          background: dark ? "#16212c" : "#FFFFFF",
          border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          opacity: 0.7,
        }}
      >
        Trang {pageNum}{totalPages ? ` / ${totalPages}` : ""} — cuộn tới để tải
      </div>
    );
  }

  return (
    <div ref={registerEl} data-page={pageNum} style={{ marginBottom: 12 }}>
      {totalPages ? (
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, opacity: 0.85 }}>
          Slide {pageNum} / {totalPages}
        </div>
      ) : null}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseUp={onMouseUp}
        style={{
          position: "relative",
          display: "inline-block",
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 1px 6px rgba(0,0,0,.15)",
          touchAction: tool === "read" ? "auto" : "none",
          cursor:
            tool === "write" || tool === "region"
              ? "crosshair"
              : tool === "erase"
                ? "cell"
                : "text",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block", borderRadius: 8 }} />
        <div
          ref={textRef}
          className="pdf-text-layer"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            userSelect: tool === "read" || tool === "highlight" ? "text" : "none",
            pointerEvents: tool === "read" || tool === "highlight" ? "auto" : "none",
          }}
        />
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {items
            .filter((i) => i.kind === "ink")
            .flatMap((i) => {
              const vd = i.vectorData as { strokes?: Stroke[] } | undefined;
              return (vd?.strokes ?? []).map((s, si) => (
                <polyline
                  key={`${i.id}-${si}`}
                  points={s.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.width}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  data-item-id={tool === "erase" ? i.id : undefined}
                  style={tool === "erase" ? { pointerEvents: "auto", cursor: "cell" } : undefined}
                  onClick={tool === "erase" ? () => onErase(i.id) : undefined}
                />
              ));
            })}
          {drawing && (
            <polyline
              points={drawing.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill="none"
              stroke={drawing.color}
              strokeWidth={drawing.width}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
        {/* Highlight + vùng khoanh */}
        {items
          .filter((i) => i.kind === "highlight" || i.kind === "region")
          .map((i) => {
            const quads =
              i.kind === "highlight"
                ? (((i.source.textAnchor as { quads?: Quad[] } | undefined)?.quads ?? []) as Quad[])
                : [];
            const rect =
              i.kind === "region"
                ? ((i.source.geometry as { rect?: Quad } | undefined)?.rect as Quad | undefined)
                : undefined;
            return (
              <div key={i.id}>
                {quads.map((q, qi) => (
                  <div
                    key={qi}
                    role={tool === "erase" ? "button" : undefined}
                    tabIndex={tool === "erase" ? 0 : undefined}
                    aria-label={tool === "erase" ? `Tẩy highlight: ${i.title ?? i.id}` : undefined}
                    data-item-id={tool === "erase" ? i.id : undefined}
                    onClick={tool === "erase" ? () => onErase(i.id) : undefined}
                    onKeyDown={
                      tool === "erase"
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") onErase(i.id);
                          }
                        : undefined
                    }
                    title={i.quote}
                    style={{
                      position: "absolute",
                      left: `${q.x * 100}%`,
                      top: `${q.y * 100}%`,
                      width: `${q.w * 100}%`,
                      height: `${q.h * 100}%`,
                      background: "rgba(255,235,59,.45)",
                      mixBlendMode: "multiply",
                      pointerEvents: tool === "erase" ? "auto" : "none",
                      cursor: tool === "erase" ? "cell" : "default",
                    }}
                  />
                ))}
                {rect && (
                  <div
                    role={tool === "erase" ? "button" : undefined}
                    tabIndex={tool === "erase" ? 0 : undefined}
                    aria-label={tool === "erase" ? `Tẩy vùng: ${i.title ?? i.id}` : undefined}
                    data-item-id={tool === "erase" ? i.id : undefined}
                    onClick={tool === "erase" ? () => onErase(i.id) : undefined}
                    onKeyDown={
                      tool === "erase"
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") onErase(i.id);
                          }
                        : undefined
                    }
                    title={i.status === "unresolved" ? `Chưa hiểu: ${i.title}` : i.title}
                    style={{
                      position: "absolute",
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.w * 100}%`,
                      height: `${rect.h * 100}%`,
                      border: i.status === "unresolved" ? "2px solid #F5822B" : "2px dashed #dc2626",
                      background:
                        i.status === "unresolved" ? "rgba(245,130,43,.12)" : "rgba(220,38,38,.06)",
                      pointerEvents: tool === "erase" ? "auto" : "none",
                      cursor: tool === "erase" ? "cell" : "default",
                    }}
                  >
                    {i.status === "unresolved" && (
                      <span
                        title="Chưa hiểu (đồng bộ với bộ ghi chú)"
                        style={{
                          position: "absolute",
                          top: -12,
                          right: -8,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#3A1F05",
                          background: "#F5822B",
                          borderRadius: 8,
                          padding: "0 6px",
                          lineHeight: "18px",
                          pointerEvents: "none",
                        }}
                      >
                        ? Chưa hiểu
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        {dragRect && (
          <div
            style={{
              position: "absolute",
              left: `${Math.min(dragRect.x0, dragRect.x1) * 100}%`,
              top: `${Math.min(dragRect.y0, dragRect.y1) * 100}%`,
              width: `${Math.abs(dragRect.x1 - dragRect.x0) * 100}%`,
              height: `${Math.abs(dragRect.y1 - dragRect.y0) * 100}%`,
              border: "2px dashed #dc2626",
              background: "rgba(220,38,38,.08)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}

function normRect(r: { x0: number; y0: number; x1: number; y1: number }): Quad {
  return {
    x: Math.min(r.x0, r.x1),
    y: Math.min(r.y0, r.y1),
    w: Math.abs(r.x1 - r.x0),
    h: Math.abs(r.y1 - r.y0),
  };
}

function FindBox({
  dark,
  getDoc,
  numPages,
  onPick,
}: {
  dark: boolean;
  getDoc: () => PdfDoc | null;
  numPages: number;
  onPick: (n: number) => void;
}) {
  const [find, setFind] = useState("");
  const [findPages, setFindPages] = useState<number[]>([]);

  async function runFind() {
    const pdf = getDoc();
    if (!pdf || !find.trim()) {
      setFindPages([]);
      return;
    }
    const needle = find.trim().toLowerCase();
    const hits: number[] = [];
    for (let n = 1; n <= numPages; n++) {
      try {
        const pg = (await pdf.getPage(n)) as {
          getTextContent: () => Promise<{ items: { str?: string }[] }>;
        };
        const tc = await pg.getTextContent();
        const text = tc.items.map((i) => i.str ?? "").join(" ").toLowerCase();
        if (text.includes(needle)) hits.push(n);
      } catch {
        /* bỏ qua trang lỗi */
      }
    }
    setFindPages(hits);
  }

  return (
    <>
      <input
        value={find}
        onChange={(e) => setFind(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") runFind();
        }}
        placeholder="Tìm trong PDF…"
        aria-label="Tìm trong PDF"
        style={{ ...tinput(dark), width: 150 }}
      />
      <button onClick={runFind} title="Tìm" aria-label="Tìm" style={tbtn(dark)}>⌕</button>
      {findPages.length > 0 && (
        <span style={{ fontSize: 12 }}>
          Thấy ở trang:{" "}
          {findPages.map((n) => (
            <button key={n} onClick={() => onPick(n)} style={{ ...tbtn(dark), marginRight: 4 }}>
              {n}
            </button>
          ))}
        </span>
      )}
    </>
  );
}

function WriteOpts({
  dark,
  inkColor,
  setInkColor,
  inkWidth,
  setInkWidth,
}: {
  dark: boolean;
  inkColor: string;
  setInkColor: (c: string) => void;
  inkWidth: number;
  setInkWidth: (w: number) => void;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
      {INK_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => setInkColor(c)}
          title={`Màu ${c}`}
          aria-label={`Màu ${c}`}
          aria-pressed={inkColor === c}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: c,
            border: inkColor === c ? "2px solid #187CFA" : "1px solid #999",
            cursor: "pointer",
          }}
        />
      ))}
      {INK_WIDTHS.map((w) => (
        <button
          key={w}
          onClick={() => setInkWidth(w)}
          title={`Độ dày ${w}`}
          aria-label={`Độ dày ${w}`}
          aria-pressed={inkWidth === w}
          style={{ ...tbtn(dark), fontWeight: inkWidth === w ? 700 : 400 }}
        >
          {w}px
        </button>
      ))}
    </span>
  );
}

function ThumbStrip({
  getPage,
  numPages,
  page,
  onPick,
  dark,
}: {
  getPage: (n: number) => Promise<unknown>;
  numPages: number;
  page: number;
  onPick: (n: number) => void;
  dark: boolean;
}) {
  return (
    <div
      style={{
        width: 110,
        maxHeight: 560,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 4,
      }}
    >
      {Array.from({ length: numPages }, (_, k) => k + 1).map((n) => (
        <Thumb key={n} n={n} getPage={getPage} active={n === page} onPick={onPick} dark={dark} />
      ))}
    </div>
  );
}

function Thumb({
  n,
  getPage,
  active,
  onPick,
  dark,
}: {
  n: number;
  getPage: (n: number) => Promise<unknown>;
  numPages?: number;
  active: boolean;
  onPick: (n: number) => void;
  dark: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const seen = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || seen.current) return;
      seen.current = true;
      getPage(n)
        .then((pg) => {
          const p = pg as {
            getViewport: (o: { scale: number }) => { width: number; height: number };
            render: (o: unknown) => { promise: Promise<void> };
          };
          const vp = p.getViewport({ scale: 0.25 });
          el.width = Math.floor(vp.width);
          el.height = Math.floor(vp.height);
          const ctx = el.getContext("2d");
          if (ctx) p.render({ canvasContext: ctx, viewport: vp }).promise.catch(() => undefined);
        })
        .catch(() => undefined);
      ob.disconnect();
    });
    ob.observe(el);
    return () => ob.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  return (
    <button
      onClick={() => onPick(n)}
      title={`Trang ${n}`}
      aria-label={`Trang ${n}`}
      aria-current={active}
      style={{
        border: active ? "2px solid #187CFA" : `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
        borderRadius: 6,
        padding: 2,
        background: "#fff",
        cursor: "pointer",
      }}
    >
      <canvas ref={ref} style={{ width: "100%", display: "block" }} />
      <span style={{ fontSize: 11 }}>{n}</span>
    </button>
  );
}

function tbtn(dark: boolean): React.CSSProperties {
  return {
    fontSize: 15,
    minWidth: 32,
    height: 32,
    padding: "0 6px",
    borderRadius: 8,
    border: `1px solid ${dark ? "#3b4c5e" : "#DCE5ED"}`,
    background: dark ? "#1d2a36" : "#FFFFFF",
    color: dark ? "#e6edf3" : "#203246",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function tinput(dark: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    padding: "6px 8px",
    borderRadius: 8,
    border: `1px solid ${dark ? "#3b4c5e" : "#DCE5ED"}`,
    background: dark ? "#0f1720" : "#FFFFFF",
    color: dark ? "#e6edf3" : "#203246",
  };
}

function SvgCursor() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2l8 6-4.5.8L5.5 13 4 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SvgPen() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M11 2l3 3L6 13H3v-3l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SvgMarker() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M9 2l5 5-8 7H2V10l7-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SvgCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <ellipse cx="8" cy="8" rx="6" ry="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

function SvgEraser() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M9 3l4 4-6 6H4l-1-1 6-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
