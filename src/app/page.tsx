"use client";

import { useEffect, useRef, useState } from "react";
import PdfReader, { type AnnotationPayload } from "@/components/PdfReader";
import {
  CURRENT_USER_ID,
  LESSON_START_PAGE,
  SAMPLE_PDF_URL,
  SEED_COURSE,
  SEED_ITEMS,
  SUGGESTED_QUESTIONS,
} from "@/lib/seed";
import { stripVi } from "@/lib/text";
import {
  newClientOperationId,
  type ItemKind,
  type LearningItem,
  type LessonPart,
  type SaveState,
} from "@/lib/types";

type PanelTab = "notes" | "ai" | "docs";
type GroupMode = "chapter" | "lesson" | "flat";
type Theme = "light" | "dark";
type Lang = "vi" | "en";

interface ChatSource {
  sectionId: string;
  title: string;
  page: number;
  lessonId: string;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  requestId?: string;
}

interface KbStage {
  name: string;
  status: "pending" | "ok" | "error" | "skipped";
  detail: string;
}

interface KbStatus {
  ready: boolean;
  documentId: string;
  filename: string;
  totalPages: number;
  chunkCount: number;
  emptyPages: number[];
  stages: KbStage[];
  updatedAt: string;
  error?: string;
  deduped?: boolean;
}

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

const ITEMS_KEY = "vlearn-items-v1";
const CHAT_KEY = "vlearn-chat-v1";

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

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function LearnPage() {
  return <Workspace />;
}

function Workspace() {
  // Giá trị mặc định đồng nhất server/client (tránh hydration branch).
  // Kho local prototype (localStorage) + deep link được nạp 1 lần sau mount.
  const [lang, setLang] = useState<Lang>("vi");
  const [theme, setTheme] = useState<Theme>("light");
  const [items, setItems] = useState<LearningItem[]>(SEED_ITEMS);
  const [activeLessonId, setActiveLessonId] = useState("blas-cover");
  const [activePartId, setActivePartId] = useState("blas-cover-pdf");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<PanelTab>("notes");
  const [group, setGroup] = useState<GroupMode>("chapter");
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveMsg, setSaveMsg] = useState("Dữ liệu mẫu đã sẵn sàng.");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [newNote, setNewNote] = useState("");
  const [aiScope, setAiScope] = useState<"page" | "lesson" | "selection">("page");
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [kb, setKb] = useState<KbStatus | null>(null);
  const [kbBusy, setKbBusy] = useState(false);
  const [kbMsg, setKbMsg] = useState("");
  const [videoTs, setVideoTs] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sideW, setSideW] = useState(248);
  const [panelW, setPanelW] = useState(360);
  const [labDone, setLabDone] = useState<Record<string, boolean>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const kbFileRef = useRef<HTMLInputElement | null>(null);

  // Trạng thái pipeline KB (fetch trong callback — không setState đồng bộ trong effect).
  useEffect(() => {
    fetch("/api/kb/status")
      .then((r) => r.json())
      .then((s) => setKb(s as KbStatus))
      .catch(() => undefined);
  }, []);

  async function ingestKb(source: { sample: true } | { file: File }) {
    if (kbBusy) return;
    setKbBusy(true);
    setKbMsg("Đang nạp…");
    try {
      let res: Response;
      if ("sample" in source) {
        res = await fetch("/api/kb/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sample: true }),
        });
      } else {
        const form = new FormData();
        form.append("file", source.file);
        res = await fetch("/api/kb/ingest", { method: "POST", body: form });
      }
      const s = (await res.json()) as KbStatus;
      setKb(s);
      if (s.ready) {
        setKbMsg(
          s.deduped
            ? "File này đã nạp rồi — dùng lại KB cũ, không tạo trùng."
            : `KB Sẵn sàng: ${s.chunkCount} đoạn / ${s.totalPages} trang. AI sẽ trả lời từ KB mới.`,
        );
      } else {
        setKbMsg(`Nạp chưa xong (${s.error ?? "xem từng stage"}) — sửa rồi bấm Nạp lại.`);
      }
    } catch {
      setKbMsg("Mất mạng khi nạp — bấm Nạp lại.");
    } finally {
      setKbBusy(false);
    }
  }

  const t = STR[lang];
  const dark = theme === "dark";

  /* eslint-disable react-hooks/set-state-in-effect -- nạp 1 lần sau mount:
     preference client-only, kho local prototype và deep link không có trên server. */
  useEffect(() => {
    try {
      const th = localStorage.getItem("vlearn-theme");
      const lg = localStorage.getItem("vlearn-lang");
      if (th === "dark" || th === "light") setTheme(th);
      if (lg === "vi" || lg === "en") setLang(lg);
      const storedItems = readLocal<LearningItem[]>(ITEMS_KEY);
      if (Array.isArray(storedItems) && storedItems.length > 0) setItems(storedItems);
      const storedChat = readLocal<ChatMsg[]>(CHAT_KEY);
      if (Array.isArray(storedChat)) setChat(storedChat);
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("part")) setActivePartId(sp.get("part") as string);
      const pg = Number(sp.get("page"));
      if (Number.isFinite(pg) && pg > 0) setPage(Math.floor(pg));
    } catch {
      /* bỏ qua */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Ghi preference + kho local (đồng bộ ra external system).
  useEffect(() => {
    try {
      localStorage.setItem("vlearn-theme", theme);
      localStorage.setItem("vlearn-lang", lang);
    } catch {
      /* bỏ qua */
    }
  }, [theme, lang]);

  useEffect(() => {
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    } catch {
      /* bỏ qua */
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(chat));
    } catch {
      /* bỏ qua */
    }
  }, [chat]);

  // Không dùng useMemo thủ công — React Compiler tự memo.
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

  const pageItems = items.filter(
    (i) =>
      !i.deletedAt &&
      i.partId === activePart.id &&
      (i.source.pageNumber ?? 0) === page &&
      (i.kind === "ink" || i.kind === "highlight" || i.kind === "region"),
  );

  function pickLesson(id: string) {
    setActiveLessonId(id);
    for (const ch of SEED_COURSE.chapters) {
      const l = ch.lessons.find((x) => x.id === id);
      if (l) {
        setActivePartId(l.parts[0].id);
        setPage(LESSON_START_PAGE[id] ?? 1);
        return;
      }
    }
  }

  // Lưu local prototype: debounce ~600ms, chỉ hiện Đã lưu sau khi ghi xong.
  function scheduleAutosave(mut: (prev: LearningItem[]) => LearningItem[]) {
    setItems(mut);
    setSaveState("saving");
    setSaveMsg("Đang lưu…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        setItems((prev) => {
          localStorage.setItem(ITEMS_KEY, JSON.stringify(prev));
          return prev;
        });
        setSaveState("saved");
        setSaveMsg("Đã lưu (kho local prototype).");
      } catch {
        setSaveState("error");
        setSaveMsg("Lưu thất bại — bộ nhớ local đầy hoặc bị chặn.");
      }
    }, 600);
  }

  function saveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
      setSaveState("saved");
      setSaveMsg("Đã lưu (kho local prototype).");
    } catch {
      setSaveState("error");
      setSaveMsg("Lưu thất bại — bộ nhớ local đầy hoặc bị chặn.");
    }
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

  // Cầu nối từ PdfReader: annotation canvas → cùng LearningItem với panel.
  function commitAnnotation(kind: ItemKind, payload: AnnotationPayload): string {
    const source: LearningItem["source"] = {
      ...sourceNow(),
      ...(payload.quads ? { textAnchor: { quads: payload.quads } } : {}),
      ...(payload.geometry ? { geometry: payload.geometry } : {}),
    };
    const item = createItem(kind, {
      source,
      quote: payload.quote,
      vectorData: payload.vectorData,
      body: payload.body ?? (kind === "region" ? "Mô tả điều chưa hiểu ở vùng đã khoanh…" : ""),
    });
    return item.id;
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
    const idSet = new Set(
      items
        .filter(
          (i) =>
            !i.deletedAt &&
            i.partId === activePart.id &&
            i.source.pageNumber === page &&
            i.ownerId === CURRENT_USER_ID,
        )
        .map((i) => i.id),
    );
    if (idSet.size === 0) {
      setSaveMsg("Trang này không có ghi chú nào.");
      return;
    }
    const nowIso = new Date().toISOString();
    scheduleAutosave((prev) =>
      prev.map((i) => (idSet.has(i.id) ? { ...i, deletedAt: nowIso } : i)),
    );
  }

  function writeDeepLink(it: LearningItem) {
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

  function openSource(it: LearningItem) {
    setActiveLessonId(it.lessonId);
    setActivePartId(it.partId);
    if (it.source.pageNumber) setPage(it.source.pageNumber);
    if (it.source.timestampMs !== undefined) setVideoTs(it.source.timestampMs);
    writeDeepLink(it);
  }

  function openAiSource(s: ChatSource) {
    setActiveLessonId(s.lessonId);
    for (const ch of SEED_COURSE.chapters) {
      const l = ch.lessons.find((x) => x.id === s.lessonId);
      if (l) {
        setActivePartId(l.parts[0].id);
        break;
      }
    }
    setPage(s.page);
  }

  function startEdit(it: LearningItem) {
    setEditingId(it.id);
    setEditBody(it.body ?? "");
  }

  function saveEdit() {
    if (!editingId) return;
    scheduleAutosave((prev) =>
      prev.map((i) =>
        i.id === editingId
          ? {
              ...i,
              body: editBody,
              revision: i.revision + 1,
              updatedAt: new Date().toISOString(),
              clientOperationId: newClientOperationId(),
            }
          : i,
      ),
    );
    setEditingId(null);
  }

  async function sendAi(retryText?: string) {
    const text = (retryText ?? aiInput).trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    const userMsg: ChatMsg = { id: newClientOperationId(), role: "user", text };
    setChat((prev) => [...prev, userMsg]);
    if (!retryText) setAiInput("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "thread-local-1",
          message: text,
          scope:
            aiScope === "page" ? "page" : aiScope === "lesson" ? "lesson" : "selection",
          scopeIds: {
            lessonId: activeLesson.lesson.id,
            partId: activePart.id,
            pageNumber: activePart.kind === "pdf" ? page : undefined,
            itemIds: aiScope === "selection" ? visibleItems.slice(0, 5).map((i) => i.id) : [],
            quotes:
              aiScope === "selection"
                ? visibleItems.slice(0, 5).map((i) => i.quote ?? i.body ?? "").filter(Boolean)
                : [],
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const data = await res.json();
      const reply: ChatMsg = {
        id: newClientOperationId(),
        role: "assistant",
        text: data.answer as string,
        sources: data.sources as ChatSource[],
        requestId: data.requestId as string,
      };
      setChat((prev) => [...prev, reply]);
    } catch {
      const err: ChatMsg = {
        id: newClientOperationId(),
        role: "assistant",
        text: "Không gọi được API AI (mất mạng hoặc server lỗi) — câu hỏi vẫn giữ, bấm Gửi lại.",
      };
      setChat((prev) => [...prev, err]);
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
                      onClick={() => pickLesson(l.id)}
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
                            setPage(LESSON_START_PAGE[l.id] ?? 1);
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
          </div>

          {activePart.kind === "pdf" && (
            <PdfReader
              key={activePart.id}
              url={activePart.assetUrl ?? SAMPLE_PDF_URL}
              page={page}
              onPageChange={setPage}
              pageItems={pageItems}
              onCommit={commitAnnotation}
              onErase={softDelete}
              onClearPage={clearPage}
              dark={dark}
            />
          )}

          {activePart.kind === "video" && (
            <section
              style={{
                background: dark ? "#16212c" : "#FFFFFF",
                border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                borderRadius: 12,
                padding: 20,
                minHeight: 200,
              }}
            >
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
            </section>
          )}
          {activePart.kind === "lab" && (
            <section
              style={{
                background: dark ? "#16212c" : "#FFFFFF",
                border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <p style={{ fontSize: 14 }}>Lab mẫu (checklist lưu local prototype):</p>
              {["Đọc slide nguồn", "Tạo 1 ghi chú neo đúng trang", "Đánh dấu 1 vùng chưa hiểu"].map(
                (s) => (
                  <label key={s} style={{ display: "block", fontSize: 14, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!labDone[`${activePart.id}-${s}`]}
                      onChange={(e) =>
                        setLabDone((p) => ({ ...p, [`${activePart.id}-${s}`]: e.target.checked }))
                      }
                    />{" "}
                    {s}
                  </label>
                ),
              )}
            </section>
          )}
          {activePart.kind === "doc" && (
            <section
              style={{
                background: dark ? "#16212c" : "#FFFFFF",
                border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <p style={{ fontSize: 14 }}>Tài liệu đính kèm:</p>
              {(activePart.attachments ?? []).length === 0 && (
                <p style={{ fontSize: 13 }}>Trống — đúng trạng thái thật, chưa có asset.</p>
              )}
            </section>
          )}

          {activePart.kind === "pdf" && activePart.instructorNotes && (
            <div style={{ marginTop: 12 }}>
              {activePart.instructorNotes.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: 12,
                    border: `1px dashed ${dark ? "#3b4c5e" : "#9db8cf"}`,
                    borderRadius: 8,
                    background: dark ? "#16212c" : "#FFFFFF",
                  }}
                >
                  <strong style={{ fontSize: 13 }}>Ghi chú giảng viên (chỉ đọc): {n.title}</strong>
                  <p style={{ fontSize: 14, margin: "6px 0 0" }}>{n.body}</p>
                </div>
              ))}
            </div>
          )}

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
            <button onClick={saveNow} style={btn(dark)}>{t.save}</button>
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
                      setSaveMsg("Ảnh mới chỉ ở local (kho prototype, chưa có Storage server).");
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
                          {it.ownerId === CURRENT_USER_ID && (
                            <button onClick={() => softDelete(it.id)} style={btn(dark)}>Xóa</button>
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
                <p style={{ fontSize: 12, opacity: 0.75 }}>
                  Trợ giảng prototype nội bộ — trả lời từ nội dung file mẫu, không gọi provider.
                </p>
                {/* Trạng thái pipeline KB */}
                <div
                  style={{
                    fontSize: 12,
                    border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <div>
                    <strong>
                      KB: {kb == null ? "đang kiểm tra…" : kb.ready ? `Sẵn sàng (${kb.chunkCount} đoạn / ${kb.totalPages} trang)` : "Chưa nạp — AI dùng tri thức mẫu"}
                    </strong>
                    {kb?.filename ? <span> · {kb.filename}</span> : null}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <button onClick={() => ingestKb({ sample: true })} disabled={kbBusy} style={btn(dark)}>
                      Nạp file mẫu
                    </button>
                    <button onClick={() => kbFileRef.current?.click()} disabled={kbBusy} style={btn(dark)}>
                      Chọn PDF khác…
                    </button>
                    <button onClick={() => ingestKb({ sample: true })} disabled={kbBusy} style={btn(dark)}>
                      Nạp lại
                    </button>
                    <input
                      ref={kbFileRef}
                      type="file"
                      accept="application/pdf"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) ingestKb({ file: f });
                      }}
                    />
                  </div>
                  {kbMsg && <div style={{ marginTop: 4 }}>{kbMsg}</div>}
                  {kb && kb.stages.length > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {kb.stages.map((s) => (
                        <li key={s.name}>
                          {s.name}: <strong>{s.status}</strong> — {s.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  {kb && kb.emptyPages.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      Trang không trích được text (cần OCR — chưa có engine, không bỏ qua âm thầm):{" "}
                      {kb.emptyPages.join(", ")}
                    </div>
                  )}
                </div>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                  {chat.length === 0 && (
                    <p style={{ fontSize: 13, opacity: 0.7 }}>Chưa có hội thoại. Hỏi một câu để bắt đầu.</p>
                  )}
                  {chat.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        fontSize: 13,
                        padding: 8,
                        borderRadius: 8,
                        background: m.role === "user" ? (dark ? "#1f3a52" : "#E3EEF7") : "transparent",
                        border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                      }}
                    >
                      <strong>{m.role === "user" ? "Bạn" : "Trợ giảng"}:</strong> {m.text}
                      {m.sources && m.sources.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          Nguồn:{" "}
                          {m.sources.map((s) => (
                            <button
                              key={s.sectionId}
                              onClick={() => openAiSource(s)}
                              style={{ ...btn(dark), marginRight: 6, marginTop: 4 }}
                            >
                              {s.title} (tr.{s.page})
                            </button>
                          ))}
                        </div>
                      )}
                      {m.requestId && (
                        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{m.requestId}</div>
                      )}
                    </div>
                  ))}
                </div>
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Hỏi trợ giảng theo phạm vi đã chọn…"
                  aria-label="Câu hỏi cho trợ giảng AI"
                  rows={3}
                  style={input(dark)}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => sendAi()} disabled={aiBusy} style={btn(dark)}>
                    {t.send}
                  </button>
                  <button
                    onClick={() => {
                      const lastUser = [...chat].reverse().find((m) => m.role === "user");
                      if (lastUser) sendAi(lastUser.text);
                    }}
                    disabled={aiBusy}
                    style={btn(dark)}
                  >
                    Gửi lại
                  </button>
                  <button onClick={() => setChat([])} style={btn(dark)}>
                    Chat mới
                  </button>
                </div>
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
