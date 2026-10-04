"use client";

import { useEffect, useRef, useState } from "react";
import {
  CURRENT_USER_ID,
  SEED_COURSE,
  SEED_ITEMS,
  SUGGESTED_QUESTIONS,
} from "@/lib/seed";
import {
  newClientOperationId,
  type ItemKind,
  type LearningItem,
  type LessonPart,
  type SaveState,
} from "@/lib/types";

type ToolMode = "read" | "write" | "highlight" | "region" | "erase";
type PanelTab = "notes" | "ai" | "docs";
type GroupMode = "chapter" | "lesson" | "flat";
type Theme = "light" | "dark";
type Lang = "vi" | "en";

const STR: Record<Lang, Record<string, string>> = {
  vi: {
    app: "VLearn Prototype",
    notes: "Ghi chú của tôi",
    ai: "Trợ giảng AI",
    docs: "Tài liệu",
    support: "Hỗ trợ",
    save: "Lưu",
    send: "Gửi",
    openSource: "Mở nguồn",
    searchPh: "Tìm ghi chú (gõ không dấu vẫn ra)…",
    brandNote: "Bản prototype độc lập — không phải hệ thống VLearn production.",
  },
  en: {
    app: "VLearn Prototype",
    notes: "My notes",
    ai: "AI tutor",
    docs: "Materials",
    support: "Support",
    save: "Save",
    send: "Send",
    openSource: "Open source",
    searchPh: "Search notes (accent-insensitive)…",
    brandNote: "Standalone prototype — not the VLearn production system.",
  },
};

const KIND_LABEL: Record<ItemKind, string> = {
  text: "Ghi chú",
  highlight: "Highlight",
  ink: "Nét viết",
  region: "Vùng chưa hiểu",
  image: "Ảnh",
  video_note: "Note video",
};

function stripVi(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function fmtTime(iso: string) {
  // Định dạng thủ công (không dùng toLocaleString trong render).
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

function partLabel(p: LessonPart) {
  return p.kind === "pdf" ? "PDF" : p.kind === "video" ? "Video" : p.kind === "lab" ? "Lab" : "Doc";
}

export default function LearnPage() {
  return <Workspace />;
}

function Workspace() {
  // Giá trị mặc định đồng nhất server/client (tránh hydration branch).
  // Preference + deep link (?part=&page=) được nạp 1 lần sau mount.
  const [lang, setLang] = useState<Lang>("vi");
  const [theme, setTheme] = useState<Theme>("light");
  const [items, setItems] = useState<LearningItem[]>(SEED_ITEMS);
  const [activeLessonId, setActiveLessonId] = useState("k04-l34-p2-t1");
  const [activePartId, setActivePartId] = useState("slide-5");
  const [page, setPage] = useState(1);
  const [tool, setTool] = useState<ToolMode>("read");
  const [tab, setTab] = useState<PanelTab>("notes");
  const [group, setGroup] = useState<GroupMode>("chapter");
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveMsg, setSaveMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [newNote, setNewNote] = useState("");
  const [aiScope, setAiScope] = useState<"page" | "lesson" | "selection">("page");
  const [aiInput, setAiInput] = useState("");
  const [aiMsg, setAiMsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [videoTs, setVideoTs] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sideW, setSideW] = useState(248);
  const [panelW, setPanelW] = useState(360);
  const [labDone, setLabDone] = useState<Record<string, boolean>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const t = STR[lang];
  const dark = theme === "dark";

  /* eslint-disable react-hooks/set-state-in-effect -- nạp 1 lần sau mount:
     preference client-only (theme/lang) + deep link ?part=&page= không có trên server. */
  useEffect(() => {
    try {
      const th = localStorage.getItem("vlearn-theme");
      const lg = localStorage.getItem("vlearn-lang");
      if (th === "dark" || th === "light") setTheme(th);
      if (lg === "vi" || lg === "en") setLang(lg);
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("part")) setActivePartId(sp.get("part") as string);
      const pg = Number(sp.get("page"));
      if (Number.isFinite(pg) && pg > 0) setPage(Math.floor(pg));
      localStorage.setItem("vlearn-theme", th ?? "light");
      localStorage.setItem("vlearn-lang", lg ?? "vi");
    } catch {
      /* bỏ qua */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      localStorage.setItem("vlearn-theme", theme);
      localStorage.setItem("vlearn-lang", lang);
    } catch {
      /* bỏ qua */
    }
  }, [theme, lang]);

  // Không dùng useMemo thủ công — React Compiler tự memo (preserve-manual-memoization).
  let activeLesson = { ch: SEED_COURSE.chapters[0], lesson: SEED_COURSE.chapters[0].lessons[0] };
  for (const ch of SEED_COURSE.chapters)
    for (const l of ch.lessons)
      if (l.id === activeLessonId) {
        activeLesson = { ch, lesson: l };
      }

  const activePart: LessonPart =
    activeLesson.lesson.parts.find((p) => p.id === activePartId) ??
    activeLesson.lesson.parts[0];

  const qNorm = stripVi(query.trim());
  const visibleItems = items
    .filter((i) => !i.deletedAt)
    .filter((i) => {
      if (!qNorm) return true;
      const hay = stripVi(`${i.title ?? ""} ${i.body ?? ""} ${i.quote ?? ""}`);
      return hay.includes(qNorm);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  const groupMap = new Map<string, { label: string; items: LearningItem[] }>();
  const chapterById = new Map(SEED_COURSE.chapters.map((c) => [c.id, c]));
  const lessonTitleById = new Map(
    SEED_COURSE.chapters.flatMap((c) => c.lessons.map((l) => [l.id, l.title] as const)),
  );
  for (const it of visibleItems) {
    const key =
      group === "chapter" ? it.chapterId : group === "lesson" ? it.lessonId : "all";
    const label =
      group === "chapter"
        ? (chapterById.get(it.chapterId)?.title ?? it.chapterId)
        : group === "lesson"
          ? (lessonTitleById.get(it.lessonId) ?? it.lessonId)
          : t.notes;
    if (!groupMap.has(key)) groupMap.set(key, { label, items: [] });
    groupMap.get(key)!.items.push(it);
  }
  const groups = [...groupMap.values()];

  const recentlyDeleted = items.filter((i) => i.deletedAt).slice(-3).reverse();

  // Lưu server thử thật qua API; 503 (thiếu Supabase) → giữ draft local + báo rõ.
  async function persistToServer(path: string, init: RequestInit, opId: string) {
    setSaveState("saving");
    setSaveMsg("Đang lưu…");
    try {
      const res = await fetch(path, init);
      if (!res.ok) {
        let code = `HTTP_${res.status}`;
        try {
          const data = await res.json();
          if (data && typeof data.code === "string") code = data.code;
        } catch {
          /* giữ mã HTTP khi body không phải JSON */
        }
        setSaveState("error");
        setSaveMsg(`Lưu thất bại (${code}) — giữ bản nháp local, không mất dữ liệu.`);
        return false;
      }
      setSaveState("saved");
      setSaveMsg(`Đã lưu (server ACK, op ${opId.slice(0, 8)}).`);
      return true;
    } catch {
      setSaveState("error");
      setSaveMsg("Mất mạng khi lưu — giữ bản nháp local, kết nối lại rồi bấm Lưu.");
      return false;
    }
  }

  function scheduleAutosave(mut: (prev: LearningItem[]) => LearningItem[]) {
    setItems(mut);
    setSaveState("saving");
    setSaveMsg("Đang lưu…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Autosave debounce ~600ms (§4). Chưa có backend → đánh dấu draft trung thực.
      setSaveState("local-draft");
      setSaveMsg("Bản nháp local (thiếu backend Supabase) — bấm Lưu để thử ghi server.");
    }, 600);
  }

  function sourceNow(): LearningItem["source"] {
    if (activePart.kind === "video")
      return { videoId: activePart.videoId, timestampMs: videoTs };
    return { documentId: activePart.documentId, pageNumber: page };
  }

  function createItem(kind: ItemKind, extra: Partial<LearningItem> = {}) {
    const nowIso = new Date().toISOString();
    const opId = newClientOperationId();
    const item: LearningItem = {
      id: opId,
      ownerId: CURRENT_USER_ID,
      courseId: SEED_COURSE.id,
      chapterId: activeLesson.ch.id,
      lessonId: activeLesson.lesson.id,
      partId: activePart.id,
      kind,
      source: sourceNow(),
      status: kind === "region" ? "unresolved" : "normal",
      sortOrder: items.length + 1,
      revision: 1,
      clientOperationId: opId,
      createdAt: nowIso,
      updatedAt: nowIso,
      title: extra.title ?? defaultTitle(kind),
      body: extra.body ?? "",
      ...extra,
    };
    scheduleAutosave((prev) => [...prev, item]);
    return item;
  }

  function defaultTitle(kind: ItemKind) {
    switch (kind) {
      case "highlight":
        return `Highlight trang ${page}`;
      case "ink":
        return `Nét viết trang ${page}`;
      case "region":
        return `Vùng chưa hiểu trang ${page}`;
      case "image":
        return "Ảnh ghi chú";
      case "video_note":
        return `Note video ${new Date(videoTs).toISOString().slice(14, 19)}`;
      default:
        return "Ghi chú mới";
    }
  }

  // Toolbar: mỗi nút có hành vi thật (tạo item neo đúng nguồn, không vẽ giả lên PDF).
  function onToolAction(mode: ToolMode) {
    setTool(mode);
    if (mode === "read") return;
    if (mode === "erase") {
      setSaveMsg("Chế độ tẩy: bấm vào một mục trong danh sách để xóa (có Hoàn tác).");
      return;
    }
    if (mode === "highlight") {
      createItem("highlight", { quote: "Bôi đen chữ trên slide để tạo quote thật (GĐ C)." });
      return;
    }
    if (mode === "write") {
      createItem("ink", { vectorData: { strokes: [] } });
      return;
    }
    createItem("region", { body: "Mô tả điều chưa hiểu ở vùng đã khoanh…" });
  }

  function undoLast() {
    const last = [...items].reverse().find((i) => !i.deletedAt && i.ownerId === CURRENT_USER_ID);
    if (!last) {
      setSaveMsg("Không có thao tác nào để hoàn tác.");
      return;
    }
    softDelete(last.id);
  }

  function softDelete(id: string) {
    scheduleAutosave((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, deletedAt: new Date().toISOString() } : i,
      ),
    );
  }

  function restore(id: string) {
    scheduleAutosave((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const next: LearningItem = {
          ...i,
          revision: i.revision + 1,
          updatedAt: new Date().toISOString(),
        };
        delete next.deletedAt;
        return next;
      }),
    );
  }

  function clearPage() {
    if (!window.confirm(`Xóa các ghi chú của trang ${page}? Có thể Hoàn tác.`)) return;
    const ids = items
      .filter(
        (i) =>
          !i.deletedAt &&
          i.partId === activePart.id &&
          i.source.pageNumber === page &&
          i.ownerId === CURRENT_USER_ID,
      )
      .map((i) => i.id);
    if (!ids.length) {
      setSaveMsg("Trang này không có ghi chú nào.");
      return;
    }
    const nowIso = new Date().toISOString();
    const idSet = new Set(ids);
    scheduleAutosave((prev) =>
      prev.map((i) => (idSet.has(i.id) ? { ...i, deletedAt: nowIso } : i)),
    );
  }

  function openSource(it: LearningItem) {
    // Deep link /learn/{course}/{lesson}?part=&page=&item= (route mới đề xuất, §4).
    setActiveLessonId(it.lessonId);
    setActivePartId(it.partId);
    if (it.source.pageNumber) setPage(it.source.pageNumber);
    if (it.source.timestampMs !== undefined) setVideoTs(it.source.timestampMs);
    const url =
      `/learn/${it.courseId}/${it.lessonId}?part=${it.partId}` +
      (it.source.pageNumber ? `&page=${it.source.pageNumber}` : "") +
      `&item=${it.id}`;
    try {
      window.history.replaceState(null, "", url);
    } catch {
      /* bỏ qua */
    }
  }

  function startEdit(it: LearningItem) {
    setEditingId(it.id);
    setEditBody(it.body ?? "");
  }

  async function saveEdit() {
    if (!editingId) return;
    const target = items.find((i) => i.id === editingId);
    if (!target) return;
    const updated: LearningItem = {
      ...target,
      body: editBody,
      revision: target.revision + 1,
      updatedAt: new Date().toISOString(),
      clientOperationId: newClientOperationId(),
    };
    setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
    setEditingId(null);
    await persistToServer(
      `/api/items/${editingId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: editBody,
          revision: updated.revision,
          clientOperationId: updated.clientOperationId,
        }),
      },
      updated.clientOperationId,
    );
  }

  async function saveAll() {
    const pending = items.find((i) => i.ownerId === CURRENT_USER_ID && !i.deletedAt);
    const opId = newClientOperationId();
    if (!pending) {
      // Không có gì mới: vẫn ping health để báo trạng thái backend thật.
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        const h = await res.json();
        setSaveState(h.supabaseConfigured ? "saved" : "local-draft");
        setSaveMsg(
          h.supabaseConfigured
            ? "Backend sẵn sàng."
            : "Backend chưa cấu hình (Supabase) — dữ liệu đang ở draft local.",
        );
      } catch {
        setSaveState("error");
        setSaveMsg("Không tới được server.");
      }
      return;
    }
    await persistToServer(
      "/api/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: pending.courseId,
          chapterId: pending.chapterId,
          lessonId: pending.lessonId,
          partId: pending.partId,
          kind: pending.kind,
          source: pending.source,
          title: pending.title,
          body: pending.body,
          quote: pending.quote,
          status: pending.status,
          clientOperationId: opId,
        }),
      },
      opId,
    );
  }

  async function sendAi() {
    if (!aiInput.trim() || aiBusy) return;
    setAiBusy(true);
    setAiMsg("Đang gửi tới /api/ai/chat…");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "thread-local-1",
          message: aiInput,
          scope:
            aiScope === "page" ? "page" : aiScope === "lesson" ? "lesson" : "selection",
          scopeIds: {
            lessonId: activeLesson.lesson.id,
            partId: activePart.id,
            pageNumber: activePart.kind === "pdf" ? page : undefined,
            itemIds: aiScope === "selection" ? visibleItems.slice(0, 5).map((i) => i.id) : [],
          },
        }),
      });
      if (!res.ok) {
        let code: string = `HTTP_${res.status}`;
        let requestId = "n/a";
        try {
          const data = await res.json();
          if (data && typeof data.code === "string") code = data.code;
          if (data && typeof data.requestId === "string") requestId = data.requestId;
        } catch {
          /* giữ mã HTTP khi body không phải JSON */
        }
        setAiMsg(
          `AI chưa chạy (${code}, requestId ${requestId}). ` +
            "Giữ nguyên câu hỏi — cấu hình key rồi gửi lại. Không dùng câu trả lời mẫu.",
        );
      } else {
        setAiMsg("Đã nhận câu trả lời (xem panel).");
      }
    } catch {
      setAiMsg("Mất mạng khi gọi AI — giữ nguyên câu hỏi, thử lại sau.");
    } finally {
      setAiBusy(false);
    }
  }

  const suggestionsByPart = new Map(SUGGESTED_QUESTIONS.map((s) => [s.partId, s.questions]));
  const suggestions = suggestionsByPart.get(activePart.id) ?? [];

  const saveColor =
    saveState === "saved"
      ? "#1a7f37"
      : saveState === "saving"
        ? "#9a6700"
        : saveState === "error"
          ? "#b42318"
          : "#6b7280";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: dark ? "#0f1720" : "#F4F7FA",
        color: dark ? "#e6edf3" : "#203246",
        fontSize: 15,
      }}
    >
      {/* Header 60px */}
      <header
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          background: dark ? "#16212c" : "#FFFFFF",
          borderBottom: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <strong style={{ color: dark ? "#fff" : "#18558B" }}>{t.app}</strong>
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          {SEED_COURSE.title} / {activeLesson.ch.title} / {activeLesson.lesson.title}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setTab("ai")} style={btn(dark)} aria-label="Trợ giảng AI">
          Trợ giảng AI
        </button>
        <button onClick={() => setTab("docs")} style={btn(dark)}>
          {t.support}
        </button>
        <button onClick={() => setTheme(dark ? "light" : "dark")} style={btn(dark)}>
          {dark ? "Sáng" : "Tối"}
        </button>
        <button onClick={() => setLang(lang === "vi" ? "en" : "vi")} style={btn(dark)}>
          {lang === "vi" ? "EN" : "VI"}
        </button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{CURRENT_USER_ID}</span>
      </header>
      <div style={{ fontSize: 12, padding: "6px 16px", opacity: 0.75 }}>{t.brandNote}</div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 90px)" }}>
        {/* Mục lục trái */}
        {outlineOpen && (
          <aside
            style={{
              width: sideW,
              minWidth: 200,
              maxWidth: 360,
              background: dark ? "#16212c" : "#FFFFFF",
              borderRight: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>Mục lục</strong>
              <span style={{ flex: 1 }} />
              <input
                type="range"
                min={200}
                max={360}
                value={sideW}
                onChange={(e) => setSideW(Number(e.target.value))}
                aria-label="Độ rộng mục lục"
              />
              <button onClick={() => setOutlineOpen(false)} style={btn(dark)} aria-label="Thu gọn mục lục">
                ‹
              </button>
            </div>
            {SEED_COURSE.chapters.map((ch) => (
              <details key={ch.id} open>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                  {ch.title}
                </summary>
                {ch.lessons.map((l) => (
                  <div key={l.id} style={{ marginLeft: 12, marginTop: 6 }}>
                    <button
                      onClick={() => {
                        setActiveLessonId(l.id);
                        setActivePartId(l.parts[0].id);
                        setPage(1);
                      }}
                      style={{
                        ...btn(dark),
                        width: "100%",
                        textAlign: "left",
                        fontWeight: l.id === activeLessonId ? 700 : 400,
                        borderColor: l.id === activeLessonId ? "#18558B" : undefined,
                      }}
                    >
                      {l.id === activeLessonId ? "▶ " : ""}{l.title}
                    </button>
                    {l.id === activeLessonId &&
                      l.parts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setActivePartId(p.id);
                            setPage(1);
                          }}
                          style={{
                            ...btn(dark),
                            width: "100%",
                            textAlign: "left",
                            marginTop: 4,
                            background:
                              p.id === activePartId
                                ? dark
                                  ? "#1f3a52"
                                  : "#E3EEF7"
                                : undefined,
                          }}
                        >
                          [{partLabel(p)}] {p.title}
                        </button>
                      ))}
                  </div>
                ))}
              </details>
            ))}
          </aside>
        )}
        {!outlineOpen && (
          <button onClick={() => setOutlineOpen(true)} style={{ ...btn(dark), margin: 8, alignSelf: "flex-start" }}>
            Mục lục ›
          </button>
        )}

        {/* Trung tâm */}
        <main style={{ flex: 1, padding: 16, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <strong>{activePart.title}</strong>
            {activePart.kind === "pdf" && (
              <span style={{ fontSize: 13 }}>— Trang {page}{activePart.pageCount ? ` / ${activePart.pageCount}` : ""}</span>
            )}
          </div>

          {/* Toolbar annotation */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }} role="toolbar" aria-label="Công cụ ghi chú">
            {(
              [
                ["read", "Đọc"],
                ["write", "Viết"],
                ["highlight", "Highlight"],
                ["region", "Khoanh chưa hiểu"],
                ["erase", "Tẩy"],
              ] as [ToolMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => onToolAction(m)}
                aria-pressed={tool === m}
                style={{
                  ...btn(dark),
                  borderColor: tool === m ? "#18558B" : undefined,
                  fontWeight: tool === m ? 700 : 400,
                }}
              >
                {label}
              </button>
            ))}
            <button onClick={undoLast} style={btn(dark)}>Hoàn tác</button>
            <button onClick={clearPage} style={btn(dark)}>Xóa trang này</button>
            {activePart.kind === "pdf" && (
              <>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} style={btn(dark)}>Slide trước</button>
                <button
                  onClick={() => setPage((p) => Math.min(activePart.pageCount ?? 99, p + 1))}
                  style={btn(dark)}
                >
                  Slide sau
                </button>
              </>
            )}
          </div>

          {/* Vùng tài liệu */}
          <section
            style={{
              background: dark ? "#16212c" : "#FFFFFF",
              border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
              borderRadius: 12,
              padding: 20,
              minHeight: 320,
            }}
          >
            {activePart.kind === "pdf" && (
              <div>
                <p style={{ fontSize: 14 }}>
                  PDF thật chưa có asset (BLOCKED — chờ file được phép dùng). Text layer chọn
                  được chữ, annotation overlay và zoom sẽ vào Giai đoạn C.
                </p>
                <p style={{ fontSize: 13, opacity: 0.8 }}>
                  Thao tác hiện tại vẫn neo đúng nguồn: mọi ghi chú tạo từ toolbar/panel
                  đều lưu documentId và số trang, hiện ngay trong bộ ghi chú.
                </p>
                {activePart.instructorNotes?.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      marginTop: 12,
                      padding: 12,
                      border: `1px dashed ${dark ? "#3b4c5e" : "#9db8cf"}`,
                      borderRadius: 8,
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>Ghi chú giảng viên (chỉ đọc): {n.title}</strong>
                    <p style={{ fontSize: 14, margin: "6px 0 0" }}>{n.body}</p>
                  </div>
                ))}
              </div>
            )}
            {activePart.kind === "video" && (
              <div>
                <p style={{ fontSize: 14 }}>
                  Video thật chưa có asset (BLOCKED). Transcript seed bên dưới vẫn click để đặt
                  timestamp; khi có video, click sẽ seek thật.
                </p>
                <label style={{ fontSize: 13 }}>
                  Timestamp note (ms):{" "}
                  <input
                    type="number"
                    value={videoTs}
                    min={0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVideoTs(Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
                    }}
                    style={{ width: 120 }}
                  />
                </label>{" "}
                <button onClick={() => createItem("video_note", { body: newNote || "Note tại timestamp hiện tại" })} style={btn(dark)}>
                  Tạo note video
                </button>
                <div style={{ marginTop: 12 }}>
                  {(activePart.transcriptCues ?? []).map((c) => (
                    <button
                      key={c.ms}
                      onClick={() => setVideoTs(c.ms)}
                      style={{
                        ...btn(dark),
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        marginTop: 4,
                        fontWeight: c.ms === videoTs ? 700 : 400,
                      }}
                    >
                      [{new Date(c.ms).toISOString().slice(14, 19)}] {c.text}
                    </button>
                  ))}
                  {!(activePart.transcriptCues ?? []).length && (
                    <p style={{ fontSize: 13 }}>Chưa có transcript cho video này.</p>
                  )}
                </div>
              </div>
            )}
            {activePart.kind === "lab" && (
              <div>
                <p style={{ fontSize: 14 }}>Lab mẫu (checklist lưu local, server BLOCKED):</p>
                {["Đọc slide nguồn", "Tạo 1 ghi chú neo đúng trang", "Đánh dấu 1 vùng chưa hiểu"].map(
                  (s, i) => (
                    <label key={s} style={{ display: "block", fontSize: 14, marginTop: 6 }}>
                      <input
                        type="checkbox"
                        checked={!!labDone[`${activePart.id}-${i}`]}
                        onChange={(e) =>
                          setLabDone((p) => ({ ...p, [`${activePart.id}-${i}`]: e.target.checked }))
                        }
                      />{" "}
                      {s}
                    </label>
                  ),
                )}
              </div>
            )}
            {activePart.kind === "doc" && (
              <div>
                <p style={{ fontSize: 14 }}>Tài liệu đính kèm:</p>
                {(activePart.attachments ?? []).length === 0 && (
                  <p style={{ fontSize: 13 }}>Trống — đúng trạng thái thật, chưa có asset.</p>
                )}
              </div>
            )}
          </section>

          {/* Trạng thái lưu */}
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <span style={{ color: saveColor, fontWeight: 700 }}>
              {saveState === "saved"
                ? "Đã lưu"
                : saveState === "saving"
                  ? "Đang lưu…"
                  : saveState === "error"
                    ? "Lưu thất bại"
                    : "Bản nháp local"}
            </span>{" "}
            <span style={{ opacity: 0.8 }}>{saveMsg}</span>{" "}
            <button onClick={saveAll} style={btn(dark)}>{t.save}</button>
          </div>
        </main>

        {/* Panel phải */}
        {panelOpen ? (
          <aside
            style={{
              width: panelW,
              minWidth: 300,
              maxWidth: 480,
              background: dark ? "#16212c" : "#FFFFFF",
              borderLeft: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(["notes", "ai", "docs"] as PanelTab[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  aria-pressed={tab === k}
                  style={{ ...btn(dark), fontWeight: tab === k ? 700 : 400 }}
                >
                  {k === "notes" ? t.notes : k === "ai" ? t.ai : t.docs}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <input
                type="range"
                min={300}
                max={480}
                value={panelW}
                onChange={(e) => setPanelW(Number(e.target.value))}
                aria-label="Độ rộng panel"
              />
              <button onClick={() => setPanelOpen(false)} style={btn(dark)} aria-label="Thu panel">›</button>
            </div>

            {tab === "notes" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchPh}
                  aria-label="Tìm ghi chú"
                  style={input(dark)}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <label style={{ fontSize: 12 }}>
                    Nhóm:{" "}
                    <select value={group} onChange={(e) => setGroup(e.target.value as GroupMode)}>
                      <option value="chapter">Theo chương</option>
                      <option value="lesson">Theo bài</option>
                      <option value="flat">Phẳng theo thời gian</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Ghi chú nhanh (neo đúng nguồn đang xem)…"
                    aria-label="Ghi chú nhanh"
                    style={{ ...input(dark), flex: 1 }}
                  />
                  <button
                    onClick={() => {
                      if (!newNote.trim()) return;
                      createItem("text", { body: newNote });
                      setNewNote("");
                    }}
                    style={btn(dark)}
                  >
                    {t.save}
                  </button>
                  <button onClick={() => fileRef.current?.click()} style={btn(dark)} aria-label="Chèn ảnh">
                    Ảnh
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const url = URL.createObjectURL(f);
                      createItem("image", { title: f.name, assetUrl: url });
                      setSaveMsg("Ảnh mới chỉ ở local (chưa upload server — Storage BLOCKED).");
                      e.target.value = "";
                    }}
                  />
                </div>
                {visibleItems.length === 0 && (
                  <p style={{ fontSize: 13 }}>Không tìm thấy ghi chú (empty state thật).</p>
                )}
                {groups.map((g) => (
                  <section key={g.label}>
                    <h3 style={{ fontSize: 13, margin: "8px 0 4px" }}>{g.label}</h3>
                    {g.items.map((it) => (
                      <article
                        key={it.id}
                        style={{
                          border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                          borderRadius: 8,
                          padding: 8,
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {KIND_LABEL[it.kind]} ·{" "}
                          {it.source.pageNumber ? `trang ${it.source.pageNumber}` : ""}
                          {it.source.timestampMs !== undefined
                            ? ` · ${new Date(it.source.timestampMs).toISOString().slice(14, 19)}`
                            : ""}{" "}
                          · {it.status === "unresolved" ? "Chưa hiểu" : it.status === "resolved" ? "Đã hiểu" : ""}
                          {" · "}{fmtTime(it.updatedAt)}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</div>
                        {it.quote && (
                          <blockquote style={{ fontSize: 13, margin: "4px 0", opacity: 0.9 }}>
                            “{it.quote}”
                          </blockquote>
                        )}
                        {it.assetUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.assetUrl} alt={it.title ?? "Ảnh ghi chú"} style={{ maxWidth: "100%", borderRadius: 6 }} />
                        )}
                        {editingId === it.id ? (
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <input
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              aria-label="Sửa ghi chú"
                              style={{ ...input(dark), flex: 1 }}
                            />
                            <button onClick={saveEdit} style={btn(dark)}>{t.save}</button>
                            <button onClick={() => setEditingId(null)} style={btn(dark)}>Hủy</button>
                          </div>
                        ) : (
                          <p style={{ fontSize: 14, margin: "4px 0" }}>{it.body}</p>
                        )}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => openSource(it)} style={btn(dark)}>{t.openSource}</button>
                          {it.ownerId === CURRENT_USER_ID && editingId !== it.id && (
                            <button onClick={() => startEdit(it)} style={btn(dark)}>Sửa</button>
                          )}
                          {it.ownerId === CURRENT_USER_ID && tool === "erase" && (
                            <button onClick={() => softDelete(it.id)} style={btn(dark)}>Tẩy mục này</button>
                          )}
                          {it.ownerId === CURRENT_USER_ID && (
                            <button
                              onClick={() =>
                                scheduleAutosave((prev) =>
                                  prev.map((p) =>
                                    p.id === it.id
                                      ? {
                                          ...p,
                                          status:
                                            p.status === "unresolved" ? "normal" : "unresolved",
                                          updatedAt: new Date().toISOString(),
                                        }
                                      : p,
                                  ),
                                )
                              }
                              style={btn(dark)}
                            >
                              {it.status === "unresolved" ? "Bỏ đánh dấu" : "Chưa hiểu"}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </section>
                ))}
                {recentlyDeleted.length > 0 && (
                  <div style={{ fontSize: 12 }}>
                    Đã xóa gần đây:{" "}
                    {recentlyDeleted.map((d) => (
                      <span key={d.id} style={{ marginRight: 8 }}>
                        {d.title ?? d.id}{" "}
                        <button onClick={() => restore(d.id)} style={btn(dark)}>Hoàn tác</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "ai" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13 }}>
                  Phạm vi (scope):{" "}
                  <select value={aiScope} onChange={(e) => setAiScope(e.target.value as typeof aiScope)}>
                    <option value="page">Trang đang xem</option>
                    <option value="lesson">Bài hiện tại</option>
                    <option value="selection">Ghi chú đã chọn</option>
                  </select>
                </label>
                {suggestions.length > 0 && (
                  <div style={{ fontSize: 13 }}>
                    Gợi ý theo slide:{" "}
                    {suggestions.map((s) => (
                      <button key={s} onClick={() => setAiInput(s)} style={{ ...btn(dark), marginRight: 6, marginTop: 4 }}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Hỏi trợ giảng theo phạm vi đã chọn…"
                  aria-label="Câu hỏi cho trợ giảng AI"
                  rows={3}
                  style={input(dark)}
                />
                <button onClick={sendAi} disabled={aiBusy} style={btn(dark)}>
                  {t.send}
                </button>
                {aiMsg && <p style={{ fontSize: 13 }}>{aiMsg}</p>}
                <p style={{ fontSize: 12, opacity: 0.75 }}>
                  AI gọi provider từ server khi có key (GĐ E). Hiện API trả 503 thật, không có
                  câu trả lời mẫu. Lịch sử chat lưu sau khi có DB.
                </p>
              </div>
            )}

            {tab === "docs" && (
              <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
                <strong>Tài liệu của phần đang xem</strong>
                {(activePart.attachments ?? []).length === 0 && <span>Trống — đúng trạng thái thật.</span>}
                <strong>Transcript</strong>
                {(activePart.transcriptCues ?? []).length === 0 && (
                  <span>Chưa có transcript cho ngữ cảnh này.</span>
                )}
                {(activePart.transcriptCues ?? []).map((c) => (
                  <button key={c.ms} onClick={() => setVideoTs(c.ms)} style={{ ...btn(dark), textAlign: "left" }}>
                    [{new Date(c.ms).toISOString().slice(14, 19)}] {c.text}
                  </button>
                ))}
              </div>
            )}
          </aside>
        ) : (
          <button onClick={() => setPanelOpen(true)} style={{ ...btn(dark), margin: 8, alignSelf: "flex-start" }}>
            Panel ‹
          </button>
        )}
      </div>
    </div>
  );
}

function btn(dark: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${dark ? "#3b4c5e" : "#DCE5ED"}`,
    background: dark ? "#1d2a36" : "#FFFFFF",
    color: dark ? "#e6edf3" : "#203246",
    cursor: "pointer",
  };
}

function input(dark: boolean): React.CSSProperties {
  return {
    fontSize: 14,
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${dark ? "#3b4c5e" : "#DCE5ED"}`,
    background: dark ? "#0f1720" : "#FFFFFF",
    color: dark ? "#e6edf3" : "#203246",
  };
}
