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

type PanelTab = "notes" | "ai" | "docs" | "support";
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
  fb?: 1 | -1;
}

interface SummaryArtifact {
  id: string;
  status: "pending" | "accepted" | "rejected";
  title: string;
  draft: string;
  itemIds: string[];
  createdAt: string;
  instruction?: string;
  mode?: string;
  requestId?: string;
  sources?: { kind: string; refId: string; title: string; page: number | null; lessonId: string }[];
}

interface MindmapProposal {
  nodes: { id: string; label: string; sourceItemId: string; uncertain: boolean }[];
  edges: { id: string; source: string; target: string; label?: string; uncertain: boolean }[];
  uncertainties: { nodeId?: string; edgeId?: string; reason: string }[];
}

interface MindmapArtifact {
  id: string;
  status: "pending" | "accepted" | "rejected";
  title: string;
  proposal: MindmapProposal;
  itemIds: string[];
  createdAt: string;
  mode?: string;
  requestId?: string;
  sources?: { kind: string; refId: string; title: string; page: number | null; lessonId: string }[];
}

interface LessonComment {
  id: string;
  text: string;
  at: string;
}

interface BugReport {
  id: string;
  title: string;
  desc: string;
  at: string;
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
const THREADS_KEY = "vlearn-threads-v1";
const SUPPORT_KEY = "vlearn-support-v1";
const PROGRESS_KEY = "vlearn-progress-v1";
const FEEDBACK_KEY = "vlearn-feedback-v1";
const CONFUSE_KEY = "vlearn-confuse-v1";
const ARTIFACT_KEY = "vlearn-artifacts-v1";
const MINDMAPS_KEY = "vlearn-mindmaps-v1";
const COMMENTS_KEY = "vlearn-comments-v1";
const BUGS_KEY = "vlearn-bugs-v1";

interface ChatThread {
  id: string;
  title: string;
  customTitle: boolean;
  updatedAt: string;
  messages: ChatMsg[];
}

interface SupportReply {
  id: string;
  from: "learner" | "coach";
  text: string;
  at: string;
}

interface SupportRequest {
  id: string;
  learnerId: string;
  classId: string;
  kind: "HoTro" | "DiemCong";
  lessonId: string;
  partId: string;
  page?: number;
  text: string;
  status: "moi" | "dang_xu_ly" | "da_tra_loi";
  replies: SupportReply[];
  createdAt: string;
}

const CLASSES = ["Lớp AI20k-01", "Lớp AI20k-02"];

function fmtTime(iso: string) {
  // Cắt trực tiếp từ chuỗi ISO (UTC) — không dùng Date local để server và
  // client format giống hệt nhau, tránh hydration mismatch.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[4]}:${m[5]} ${m[3]}/${m[2]}`;
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
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [kb, setKb] = useState<KbStatus | null>(null);
  const [kbBusy, setKbBusy] = useState(false);
  const [kbMsg, setKbMsg] = useState("");
  const [videoTs, setVideoTs] = useState(0);
  const [role, setRole] = useState<"learner" | "coach">("learner");
  const [support, setSupport] = useState<SupportRequest[]>([]);
  const [supClass, setSupClass] = useState(CLASSES[0]);
  const [supKind, setSupKind] = useState<"HoTro" | "DiemCong">("HoTro");
  const [supText, setSupText] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [helpful, setHelpful] = useState<Record<string, boolean>>({});
  const [confuseKind, setConfuseKind] = useState<"kho_hieu" | "be_tac" | "da_hieu" | "">("");
  const [confuseText, setConfuseText] = useState("");
  const [confused, setConfused] = useState<Record<string, { kind: string; text: string; at: string }>>({});
  const [artifacts, setArtifacts] = useState<SummaryArtifact[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftItemIds, setDraftItemIds] = useState<string[]>([]);
  const [sumInstruction, setSumInstruction] = useState("");
  const [sumScope, setSumScope] = useState<"visible" | "lesson">("visible");
  const [sumOff, setSumOff] = useState<Record<string, boolean>>({});
  const [sumBusy, setSumBusy] = useState(false);
  const [sumErr, setSumErr] = useState("");
  const [sumSources, setSumSources] = useState<SummaryArtifact["sources"]>([]);
  const [sumMode, setSumMode] = useState("");
  const [sumRequestId, setSumRequestId] = useState("");
  const lastPayload = useRef<{ instruction: string; scope: { lessonId: string; partId: string }; notes: object[] } | null>(null);
  // F17 — hỏi AI theo vùng khoanh (crop + ngữ cảnh + câu hỏi).
  const [vision, setVision] = useState<{
    crop: string;
    rect: { x: number; y: number; w: number; h: number };
    page: number;
    lessonId: string;
    partId: string;
  } | null>(null);
  const [visQ, setVisQ] = useState("");
  const [visBusy, setVisBusy] = useState(false);
  const [visErr, setVisErr] = useState("");
  const visPayload = useRef<object | null>(null);
  // N06 — mindmap: proposal sửa được + uncertainties phải xác nhận mới duyệt.
  const [mindmaps, setMindmaps] = useState<MindmapArtifact[]>([]);
  const [mmOpen, setMmOpen] = useState(false);
  const [mmBusy, setMmBusy] = useState(false);
  const [mmErr, setMmErr] = useState("");
  const [mmProposal, setMmProposal] = useState<MindmapProposal | null>(null);
  const [mmSources, setMmSources] = useState<SummaryArtifact["sources"]>([]);
  const [mmMode, setMmMode] = useState("");
  const [mmRequestId, setMmRequestId] = useState("");
  const [mmItemIds, setMmItemIds] = useState<string[]>([]);
  const [mmSel, setMmSel] = useState<string | null>(null);
  const [mmConfirmed, setMmConfirmed] = useState<Record<number, boolean>>({});
  const [mmEdgeA, setMmEdgeA] = useState("");
  const [mmEdgeB, setMmEdgeB] = useState("");
  const [mmEdgeLabel, setMmEdgeLabel] = useState("");
  // F19 — stream thật từ provider (thiếu key → 503 rõ ràng).
  const [streamOn, setStreamOn] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamAbort = useRef<AbortController | null>(null);
  const [comments, setComments] = useState<Record<string, LessonComment[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sideW, setSideW] = useState(248);
  const [panelW, setPanelW] = useState(360);
  const [labDone, setLabDone] = useState<Record<string, boolean>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<LearningItem[]>(SEED_ITEMS);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const kbFileRef = useRef<HTMLInputElement | null>(null);

  // Trạng thái pipeline KB (async/await + try/catch đầy đủ).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/kb/status");
        if (!res.ok) return;
        const s = (await res.json()) as KbStatus;
        if (alive) setKb(s);
      } catch {
        /* offline — giữ trạng thái đang có */
      }
    })();
    return () => {
      alive = false;
    };
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
      const storedThreads = readLocal<ChatThread[]>(THREADS_KEY);
      if (Array.isArray(storedThreads) && storedThreads.length > 0) {
        setThreads(storedThreads);
        setActiveThreadId(storedThreads[0].id);
      } else {
        // Di trú kho chat đơn cũ (nếu có) thành luồng đầu tiên.
        const legacy = readLocal<ChatMsg[]>("vlearn-chat-v1");
        if (Array.isArray(legacy) && legacy.length > 0) {
          const t0: ChatThread = {
            id: newClientOperationId(),
            title: "Cuộc trò chuyện 1",
            customTitle: false,
            updatedAt: new Date().toISOString(),
            messages: legacy,
          };
          setThreads([t0]);
          setActiveThreadId(t0.id);
        }
      }
      const storedSupport = readLocal<SupportRequest[]>(SUPPORT_KEY);
      if (Array.isArray(storedSupport)) setSupport(storedSupport);
      const storedProgress = readLocal<Record<string, string>>(PROGRESS_KEY);
      if (storedProgress && typeof storedProgress === "object") setProgress(storedProgress);
      const storedHelpful = readLocal<Record<string, boolean>>(FEEDBACK_KEY);
      if (storedHelpful && typeof storedHelpful === "object") setHelpful(storedHelpful);
      const storedConfused = readLocal<Record<string, { kind: string; text: string; at: string }>>(CONFUSE_KEY);
      if (storedConfused && typeof storedConfused === "object") setConfused(storedConfused);
      const storedArtifacts = readLocal<SummaryArtifact[]>(ARTIFACT_KEY);
      if (Array.isArray(storedArtifacts)) setArtifacts(storedArtifacts);
      const storedMindmaps = readLocal<MindmapArtifact[]>(MINDMAPS_KEY);
      if (Array.isArray(storedMindmaps)) setMindmaps(storedMindmaps);
      const storedComments = readLocal<Record<string, LessonComment[]>>(COMMENTS_KEY);
      if (storedComments && typeof storedComments === "object") setComments(storedComments);
      const storedBugs = readLocal<BugReport[]>(BUGS_KEY);
      if (Array.isArray(storedBugs)) setBugs(storedBugs);
      const storedRole = localStorage.getItem("vlearn-role");
      if (storedRole === "coach" || storedRole === "learner") setRole(storedRole);
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
      localStorage.setItem("vlearn-role", role);
    } catch {
      /* bỏ qua */
    }
  }, [theme, lang, role]);

  useEffect(() => {
    itemsRef.current = items;
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    } catch {
      /* bỏ qua */
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
    } catch {
      /* bỏ qua */
    }
  }, [threads]);

  useEffect(() => {
    try {
      localStorage.setItem(SUPPORT_KEY, JSON.stringify(support));
    } catch {
      /* bỏ qua */
    }
  }, [support]);

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      /* bỏ qua */
    }
  }, [progress]);

  useEffect(() => {
    try {
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(helpful));
    } catch {
      /* bỏ qua */
    }
  }, [helpful]);

  useEffect(() => {
    try {
      localStorage.setItem(CONFUSE_KEY, JSON.stringify(confused));
    } catch {
      /* bỏ qua */
    }
  }, [confused]);

  useEffect(() => {
    try {
      localStorage.setItem(ARTIFACT_KEY, JSON.stringify(artifacts));
    } catch {
      /* bỏ qua */
    }
  }, [artifacts]);

  useEffect(() => {
    try {
      localStorage.setItem(MINDMAPS_KEY, JSON.stringify(mindmaps));
    } catch {
      /* bỏ qua */
    }
  }, [mindmaps]);

  useEffect(() => {
    try {
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
    } catch {
      /* bỏ qua */
    }
  }, [comments]);

  useEffect(() => {
    try {
      localStorage.setItem(BUGS_KEY, JSON.stringify(bugs));
    } catch {
      /* bỏ qua */
    }
  }, [bugs]);

  // N03 — đồng bộ cross-tab: tab khác ghi kho note → merge theo revision
  // (mới hơn thắng); trùng revision khác nội dung → giữ bản updatedAt mới hơn
  // và báo xung đột rõ, không âm thầm ghi đè.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ITEMS_KEY || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue) as LearningItem[];
        if (!Array.isArray(incoming)) return;
        const map = new Map(itemsRef.current.map((i) => [i.id, i]));
        let changed = false;
        let conflict = false;
        for (const inc of incoming) {
          if (!inc || typeof inc.id !== "string") continue;
          const cur = map.get(inc.id);
          if (!cur) {
            map.set(inc.id, inc);
            changed = true;
            continue;
          }
          if (inc.revision > cur.revision) {
            map.set(inc.id, inc);
            changed = true;
          } else if (
            inc.revision === cur.revision &&
            inc.updatedAt !== cur.updatedAt &&
            (inc.body ?? "") !== (cur.body ?? "")
          ) {
            conflict = true;
            if (inc.updatedAt > cur.updatedAt) {
              map.set(inc.id, inc);
              changed = true;
            }
          }
        }
        if (changed) setItems([...map.values()]);
        if (conflict)
          setSaveMsg("Tab khác cũng sửa cùng ghi chú — đã giữ bản mới nhất theo thời gian, kiểm tra lại nội dung.");
        else if (changed) setSaveMsg("Đã đồng bộ thay đổi ghi chú từ tab khác.");
      } catch {
        /* payload tab khác hỏng — giữ nguyên */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Mobile: matchMedia subscription (setState trong callback — đúng pattern).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const activeThread = threads.find((x) => x.id === activeThreadId) ?? null;
  const chat = activeThread?.messages ?? [];

  function pushMsg(threadId: string, msg: ChatMsg, titleHint?: string) {
    setThreads((prev) =>
      prev.map((x) => {
        if (x.id !== threadId) return x;
        const title =
          !x.customTitle && titleHint && x.messages.length === 0
            ? titleHint.slice(0, 40)
            : x.title;
        return { ...x, title, updatedAt: new Date().toISOString(), messages: [...x.messages, msg] };
      }),
    );
  }

  function newThread() {
    const n = threads.length + 1;
    const th: ChatThread = {
      id: newClientOperationId(),
      title: `Cuộc trò chuyện ${n}`,
      customTitle: false,
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setThreads((prev) => [th, ...prev]);
    setActiveThreadId(th.id);
  }

  function renameThread(id: string) {
    const cur = threads.find((x) => x.id === id);
    const name = window.prompt("Tên cuộc trò chuyện:", cur?.title ?? "");
    if (!name || !name.trim()) return;
    setThreads((prev) =>
      prev.map((x) => (x.id === id ? { ...x, title: name.trim(), customTitle: true } : x)),
    );
  }

  function deleteThread(id: string) {
    if (!window.confirm("Xóa cuộc trò chuyện này?")) return;
    const next = threads.filter((x) => x.id !== id);
    setThreads(next);
    if (activeThreadId === id) setActiveThreadId(next[0]?.id ?? null);
  }

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

  // Lưu local prototype: debounce ~600ms. Ghi thực do effect [items] đảm nhiệm
  // (chạy trước khi lật trạng thái), timer chỉ lật Đã lưu sau khi ghi xong.
  function scheduleAutosave(mut: (prev: LearningItem[]) => LearningItem[]) {
    setItems(mut);
    setSaveState("saving");
    setSaveMsg("Đang lưu…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState("saved");
      setSaveMsg("Đã lưu (kho local prototype).");
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

  const myId = role === "coach" ? "coach-1" : CURRENT_USER_ID;

  // F27 — Hỗ trợ/Điểm cộng trong prototype (không gửi tới VLearn thật).
  function sendSupport() {
    if (!supText.trim()) {
      setSaveMsg("Nội dung hỗ trợ trống — nhập rồi gửi.");
      return;
    }
    const r: SupportRequest = {
      id: newClientOperationId(),
      learnerId: CURRENT_USER_ID,
      classId: supClass,
      kind: supKind,
      lessonId: activeLesson.lesson.id,
      partId: activePart.id,
      page: activePart.kind === "pdf" ? page : undefined,
      text: supText.trim(),
      status: "moi",
      replies: [],
      createdAt: new Date().toISOString(),
    };
    setSupport((prev) => [r, ...prev]);
    setSupText("");
    setSaveMsg("Đã gửi yêu cầu hỗ trợ (kho local prototype).");
  }

  function replySupport(id: string) {
    const text = (replyDraft[id] ?? "").trim();
    if (!text) return;
    setSupport((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "da_tra_loi",
              replies: [
                ...r.replies,
                { id: newClientOperationId(), from: role, text, at: new Date().toISOString() },
              ],
            }
          : r,
      ),
    );
    setReplyDraft((prev) => ({ ...prev, [id]: "" }));
  }

  function setSupStatus(id: string, status: SupportRequest["status"]) {
    setSupport((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  // F03 — tiến độ do người học đánh dấu; xem ≠ hiểu.
  const allLessons = SEED_COURSE.chapters.flatMap((c) => c.lessons);
  const viewedCount = allLessons.filter((l) => progress[l.id]).length;

  function markViewed() {
    setProgress((prev) => ({ ...prev, [activeLesson.lesson.id]: new Date().toISOString() }));
  }

  // F25/F26 — Hữu ích + phản hồi bối rối (khử định danh: không lưu owner/email).
  function sendConfuse() {
    if (!confuseKind) {
      setSaveMsg("Chọn trạng thái (Khó hiểu/Bế tắc/Đã hiểu) rồi gửi.");
      return;
    }
    setConfused((prev) => ({
      ...prev,
      [activeLesson.lesson.id]: { kind: confuseKind, text: confuseText.trim(), at: new Date().toISOString() },
    }));
    setConfuseKind("");
    setConfuseText("");
    setSaveMsg("Đã gửi phản hồi bối rối (ẩn danh — không kèm email/ID).");
  }

  // N05 — AI tổng hợp theo yêu cầu (backend /api/ai/summarize).
  // Người học chọn note/phạm vi + nhập yêu cầu → backend lấy nội dung đã lưu
  // và nguồn có quyền, gọi AI bằng TEXT trích xuất (không PDF) → bản nháp có
  // nguồn → sửa/duyệt/bỏ. Artifact lưu riêng, note gốc giữ nguyên.
  function sumPool(): LearningItem[] {
    if (sumScope === "lesson")
      return items.filter(
        (i) => !i.deletedAt && i.lessonId === activeLesson.lesson.id,
      );
    return visibleItems;
  }

  function openPanel() {
    setSumErr("");
    setSumSources([]);
    setDraftOpen(true);
  }

  async function requestSummary(isRetry = false) {
    const pool = sumPool().filter((i) => !sumOff[i.id]);
    const instruction = sumInstruction.trim() || "Gom ý chính và điểm chưa hiểu còn mở.";
    if (pool.length === 0) {
      setSumErr("Chưa chọn ghi chú nào trong phạm vi — tick chọn ít nhất 1 ghi chú.");
      return;
    }
    const payload = {
      instruction,
      scope: { lessonId: activeLesson.lesson.id, partId: activePart.id },
      notes: pool.map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        quote: i.quote,
        kind: i.kind,
        lessonId: i.lessonId,
        partId: i.partId,
        pageNumber: i.source.pageNumber,
        status: i.status,
        documentId: i.source.documentId,
      })),
    };
    lastPayload.current = payload;
    if (!isRetry) {
      setDraftText("");
      setSumSources([]);
    }
    setSumBusy(true);
    setSumErr("");
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP_${res.status}`);
      setDraftText((data as { draft: string }).draft);
      setDraftItemIds(pool.map((i) => i.id));
      setSumSources((data as { sources: SummaryArtifact["sources"] }).sources ?? []);
      setSumMode((data as { mode?: string }).mode ?? "");
      setSumRequestId((data as { requestId?: string }).requestId ?? "");
      const dropped = (data as { dropped?: number }).dropped ?? 0;
      if (dropped > 0) setSumErr(`Đã loại ${dropped} ghi chú ngoài tài liệu active.`);
    } catch (e) {
      setSumErr(e instanceof Error ? e.message : "Gọi AI thất bại — bấm Thử lại.");
    } finally {
      setSumBusy(false);
    }
  }

  function retrySummary() {
    if (!lastPayload.current) {
      requestSummary(false);
      return;
    }
    // Retry thật: gửi lại đúng payload đã lưu.
    const p = lastPayload.current;
    setSumBusy(true);
    setSumErr("");
    fetch("/api/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP_${res.status}`);
        setDraftText((data as { draft: string }).draft);
        setSumSources((data as { sources: SummaryArtifact["sources"] }).sources ?? []);
        setSumMode((data as { mode?: string }).mode ?? "");
        setSumRequestId((data as { requestId?: string }).requestId ?? "");
      })
      .catch((e: unknown) => {
        setSumErr(e instanceof Error ? e.message : "Gọi AI thất bại — bấm Thử lại.");
      })
      .finally(() => setSumBusy(false));
  }

  // F17 — hỏi AI về vùng đã khoanh: crop đúng vùng + ngữ cảnh trang + câu hỏi.
  // Crop chỉ giữ trong phiên (không persist localStorage để tránh phình kho).
  function askVision(info: { rect: { x: number; y: number; w: number; h: number }; crop: string }) {
    setVision({
      ...info,
      page,
      lessonId: activeLesson.lesson.id,
      partId: activePart.id,
    });
    setVisQ("");
    setVisErr("");
    setTab("ai");
  }

  async function sendVision(isRetry = false) {
    if (!vision || visBusy) return;
    const question = (isRetry ? (visPayload.current as { question?: string } | null)?.question : visQ)?.trim() || visQ.trim();
    if (!question && !isRetry) {
      setVisErr("Nhập câu hỏi về vùng đã khoanh rồi gửi.");
      return;
    }
    const q = question || visQ.trim();
    if (!q) {
      setVisErr("Nhập câu hỏi về vùng đã khoanh rồi gửi.");
      return;
    }
    const payload = {
      question: q,
      lessonId: vision.lessonId,
      partId: vision.partId,
      pageNumber: vision.page,
      geometry: vision.rect,
      imageDataUrl: vision.crop,
      contextNotes: items
        .filter((i) => !i.deletedAt && i.partId === vision.partId && (i.source.pageNumber ?? 0) === vision.page)
        .slice(0, 5)
        .map((i) => `${i.title ?? ""}: ${(i.quote ?? i.body ?? "").slice(0, 200)}`),
    };
    visPayload.current = payload;
    setVisBusy(true);
    setVisErr("");
    try {
      const res = await fetch("/api/ai/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP_${res.status}`);
      // Lưu Q&A vào luồng chat hiện tại để mở lại sau reload (ảnh crop không persist).
      let tid = activeThreadId;
      if (!tid || !threads.some((x) => x.id === tid)) {
        const th: ChatThread = {
          id: newClientOperationId(),
          title: q.slice(0, 40),
          customTitle: false,
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        setThreads((prev) => [th, ...prev]);
        setActiveThreadId(th.id);
        tid = th.id;
      }
      pushMsg(tid, { id: newClientOperationId(), role: "user", text: `[Vùng trang ${vision.page}] ${q}` }, q);
      pushMsg(tid, {
        id: newClientOperationId(),
        role: "assistant",
        text: (data as { answer: string }).answer,
        sources: (data as { sources: ChatSource[] }).sources,
        requestId: (data as { requestId: string }).requestId,
      });
      setVisQ("");
    } catch (e) {
      setVisErr(e instanceof Error ? e.message : "Hỏi vision thất bại — bấm Thử lại.");
    } finally {
      setVisBusy(false);
    }
  }

  // N06 — xin proposal mindmap từ backend (note đã lưu + phạm vi có quyền).
  async function requestMindmap() {
    const pool = sumPool().filter((i) => !sumOff[i.id]);
    if (pool.length === 0) {
      setMmErr("Chưa chọn ghi chú nào trong phạm vi — tick chọn ít nhất 1 ghi chú.");
      return;
    }
    setMmBusy(true);
    setMmErr("");
    try {
      const res = await fetch("/api/ai/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: { lessonId: activeLesson.lesson.id, partId: activePart.id, title: activeLesson.lesson.title },
          notes: pool.map((i) => ({
            id: i.id,
            title: i.title,
            body: i.body,
            quote: i.quote,
            kind: i.kind,
            lessonId: i.lessonId,
            partId: i.partId,
            pageNumber: i.source.pageNumber,
            documentId: i.source.documentId,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP_${res.status}`);
      setMmProposal((data as { proposal: MindmapProposal }).proposal);
      setMmSources((data as { sources: MindmapArtifact["sources"] }).sources ?? []);
      setMmMode((data as { mode?: string }).mode ?? "");
      setMmRequestId((data as { requestId?: string }).requestId ?? "");
      setMmItemIds(pool.map((i) => i.id));
      setMmConfirmed({});
      setMmSel(null);
    } catch (e) {
      setMmErr(e instanceof Error ? e.message : "Tạo sơ đồ thất bại — bấm Tạo lại.");
    } finally {
      setMmBusy(false);
    }
  }

  function mmNode(id: string) {
    return mmProposal?.nodes.find((n) => n.id === id) ?? null;
  }

  function setMmLabel(id: string, label: string) {
    setMmProposal((p) => (p ? { ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, label } : n)) } : p));
  }

  function deleteMmNode(id: string) {
    if (id === "root") return;
    setMmProposal((p) =>
      p
        ? {
            nodes: p.nodes.filter((n) => n.id !== id),
            edges: p.edges.filter((e) => e.source !== id && e.target !== id),
            uncertainties: p.uncertainties.filter((u) => u.nodeId !== id),
          }
        : p,
    );
    if (mmSel === id) setMmSel(null);
  }

  function deleteMmEdge(id: string) {
    setMmProposal((p) =>
      p
        ? {
            ...p,
            edges: p.edges.filter((e) => e.id !== id),
            uncertainties: p.uncertainties.filter((u) => u.edgeId !== id),
          }
        : p,
    );
  }

  function addMmEdge() {
    if (!mmEdgeA || !mmEdgeB || mmEdgeA === mmEdgeB || !mmProposal) return;
    if (!mmNode(mmEdgeA) || !mmNode(mmEdgeB)) return;
    const id = `e-user-${Date.now()}`;
    setMmProposal((p) =>
      p ? { ...p, edges: [...p.edges, { id, source: mmEdgeA, target: mmEdgeB, label: mmEdgeLabel.trim() || undefined, uncertain: false }] } : p,
    );
    setMmEdgeA("");
    setMmEdgeB("");
    setMmEdgeLabel("");
  }

  function openMmSource(refId: string) {
    const s = (mmSources ?? []).find((x) => x.refId === refId);
    if (s) {
      openSummarySource(s as { kind: string; refId: string; title: string; page: number | null; lessonId: string });
      return;
    }
    const it = items.find((x) => x.id === refId);
    if (it) openSource(it);
  }

  function saveMindmap(status: "pending" | "accepted" | "rejected") {
    if (!mmProposal) return;
    setMindmaps((prev) => [
      {
        id: newClientOperationId(),
        status,
        title: `Sơ đồ ${activeLesson.lesson.title}`,
        proposal: mmProposal,
        itemIds: mmItemIds,
        createdAt: new Date().toISOString(),
        mode: mmMode || undefined,
        requestId: mmRequestId || undefined,
        sources: mmSources && mmSources.length > 0 ? mmSources : undefined,
      },
      ...prev,
    ]);
    setMmOpen(false);
    setMmProposal(null);
    setSaveMsg(
      status === "accepted"
        ? "Đã duyệt sơ đồ — lưu phiên bản riêng, bản gốc (ghi chú/ảnh/nét vẽ) giữ nguyên."
        : "Đã lưu sơ đồ ở trạng thái bỏ qua.",
    );
  }

  // F19 — stream thật từ provider qua POST /api/ai/chat {stream:true}.
  // Parse SSE OpenAI-style; Stop hủy cả upstream (AbortController).
  async function sendAiStream(text: string) {
    const t = text.trim();
    if (!t || aiBusy || streaming) return;
    let tid = activeThreadId;
    if (!tid || !threads.some((x) => x.id === tid)) {
      const th: ChatThread = {
        id: newClientOperationId(),
        title: t.slice(0, 40),
        customTitle: false,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setThreads((prev) => [th, ...prev]);
      setActiveThreadId(th.id);
      tid = th.id;
    }
    const userMsg: ChatMsg = { id: newClientOperationId(), role: "user", text: t };
    pushMsg(tid, userMsg, t);
    setAiInput("");
    const ctrl = new AbortController();
    streamAbort.current = ctrl;
    setStreaming(true);
    const asstId = newClientOperationId();
    pushMsg(tid, { id: asstId, role: "assistant", text: "" });
    const append = (delta: string) =>
      setThreads((prev) =>
        prev.map((x) =>
          x.id === tid
            ? { ...x, messages: x.messages.map((m) => (m.id === asstId ? { ...m, text: m.text + delta } : m)) }
            : x,
        ),
      );
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "thread-local-1",
          message: t,
          scope: aiScope === "page" ? "page" : aiScope === "lesson" ? "lesson" : "selection",
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
          stream: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error((err as { message?: string } | null)?.message ?? `HTTP_${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          for (const line of part.split("\n")) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const payload = s.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
              const d = j.choices?.[0]?.delta?.content ?? "";
              if (d) append(d);
            } catch {
              /* chunk giữ lại ở buf — bỏ qua dòng lỗi */
            }
          }
        }
      }
    } catch (e) {
      append(
        e instanceof Error && e.name === "AbortError"
          ? "\n[Đã dừng stream theo yêu cầu.]"
          : `\n[Stream lỗi: ${e instanceof Error ? e.message : "không rõ"} — câu hỏi vẫn giữ, bấm Gửi lại.]`,
      );
    } finally {
      streamAbort.current = null;
      setStreaming(false);
    }
  }

  function openSummarySource(s: NonNullable<SummaryArtifact["sources"]>[number]) {
    if (s.kind === "note") {
      const it = items.find((x) => x.id === s.refId);
      if (it) {
        openSource(it);
        return;
      }
      // Note gốc đã xóa/mất: ngã về trang KB cùng bài (nếu có).
    }
    if (s.lessonId) {
      setActiveLessonId(s.lessonId);
      for (const ch of SEED_COURSE.chapters) {
        const l = ch.lessons.find((x) => x.id === s.lessonId);
        if (l) {
          setActivePartId(l.parts[0].id);
          break;
        }
      }
      if (s.page) setPage(s.page);
    }
  }

  function saveDraft(status: "pending" | "accepted" | "rejected") {
    const art: SummaryArtifact = {
      id: newClientOperationId(),
      status,
      title: `Tổng hợp ${activeLesson.lesson.title}`,
      draft: draftText,
      itemIds: draftItemIds,
      createdAt: new Date().toISOString(),
      instruction: sumInstruction.trim() || undefined,
      mode: sumMode || undefined,
      requestId: sumRequestId || undefined,
      sources: sumSources && sumSources.length > 0 ? sumSources : undefined,
    };
    if (status === "accepted") {
      // Duyệt: lưu thành note mới kèm provenance; note gốc không thay đổi.
      createItem("text", {
        title: `Đã duyệt: ${art.title}`,
        body: `${draftText}\n\n(Nguồn: ${draftItemIds.length} ghi chú gốc, giữ nguyên.)`,
      });
    }
    setArtifacts((prev) => [art, ...prev]);
    setDraftOpen(false);
    setSaveMsg(
      status === "accepted" ? "Đã duyệt — lưu bản tổng hợp, ghi chú gốc giữ nguyên." : "Đã lưu bản nháp ở trạng thái bỏ qua.",
    );
  }

  function rateMsg(threadId: string, msgId: string, fb: 1 | -1) {
    setThreads((prev) =>
      prev.map((x) =>
        x.id === threadId
          ? { ...x, messages: x.messages.map((m) => (m.id === msgId ? { ...m, fb } : m)) }
          : x,
      ),
    );
  }

  function moveItem(id: string, dir: -1 | 1) {
    const order = visibleItems.map((i) => i.id);
    const idx = order.indexOf(id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= order.length) return;
    const a = visibleItems[idx];
    const b = visibleItems[j];
    scheduleAutosave((prev) =>
      prev.map((i) => {
        if (i.id === a.id) return { ...i, sortOrder: b.sortOrder };
        if (i.id === b.id) return { ...i, sortOrder: a.sortOrder };
        return i;
      }),
    );
  }

  function addComment() {
    const text = commentDraft.trim();
    if (!text) {
      setSaveMsg("Bình luận trống — nhập rồi gửi.");
      return;
    }
    if (text.length > 500) {
      setSaveMsg("Bình luận tối đa 500 ký tự.");
      return;
    }
    const c: LessonComment = { id: newClientOperationId(), text, at: new Date().toISOString() };
    setComments((prev) => ({
      ...prev,
      [activeLesson.lesson.id]: [...(prev[activeLesson.lesson.id] ?? []), c],
    }));
    setCommentDraft("");
  }

  function sendBug() {
    if (!bugTitle.trim() || !bugDesc.trim()) {
      setSaveMsg("Báo lỗi cần tiêu đề và mô tả.");
      return;
    }
    setBugs((prev) => [
      { id: newClientOperationId(), title: bugTitle.trim(), desc: bugDesc.trim(), at: new Date().toISOString() },
      ...prev,
    ]);
    setBugTitle("");
    setBugDesc("");
    setSaveMsg("Đã ghi nhận báo lỗi kỹ thuật (kho local prototype).");
  }

  async function sendAi(retryText?: string) {
    const text = (retryText ?? aiInput).trim();
    if (!text || aiBusy) return;
    // Luôn gửi trong một luồng (tạo mới nếu chưa có) để mở lại sau reload.
    let tid = activeThreadId;
    if (!tid || !threads.some((x) => x.id === tid)) {
      const th: ChatThread = {
        id: newClientOperationId(),
        title: text.slice(0, 40),
        customTitle: false,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setThreads((prev) => [th, ...prev]);
      setActiveThreadId(th.id);
      tid = th.id;
    }
    setAiBusy(true);
    const userMsg: ChatMsg = { id: newClientOperationId(), role: "user", text };
    pushMsg(tid, userMsg, text);
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
      pushMsg(tid, reply);
    } catch {
      const err: ChatMsg = {
        id: newClientOperationId(),
        role: "assistant",
        text: "Không gọi được API AI (mất mạng hoặc server lỗi) — câu hỏi vẫn giữ, bấm Gửi lại.",
      };
      pushMsg(tid, err);
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
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: dark ? "#16212c" : "#FFFFFF",
          borderBottom: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
          position: "sticky",
          top: 0,
          zIndex: 20,
          ...(isMobile
            ? { minHeight: 60, height: "auto", flexWrap: "wrap", padding: "8px 16px" }
            : { height: 60, padding: "0 16px" }),
        }}
      >
        <strong style={{ color: dark ? "#fff" : "#18558B" }}>{t.app}</strong>
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          {SEED_COURSE.title} / {activeLesson.ch.title} / {activeLesson.lesson.title}
        </span>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          Tiến độ {viewedCount}/{allLessons.length}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setTab("ai")} style={btn(dark)} aria-label="Trợ giảng AI">
          Trợ giảng AI
        </button>
        <button onClick={() => setTab("support")} style={btn(dark)}>
          {t.support}
        </button>
        <button onClick={() => setTheme(dark ? "light" : "dark")} style={btn(dark)}>
          {dark ? "Sáng" : "Tối"}
        </button>
        <button onClick={() => setLang(lang === "vi" ? "en" : "vi")} style={btn(dark)}>
          {lang === "vi" ? "EN" : "VI"}
        </button>
        <div style={{ position: "relative" }}>
          <button onClick={() => setAccountOpen((v) => !v)} style={btn(dark)} aria-label="Menu tài khoản">
            {role === "coach" ? "Coach" : CURRENT_USER_ID} ▾
          </button>
          {accountOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 40,
                width: 280,
                background: dark ? "#16212c" : "#FFFFFF",
                border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
                zIndex: 30,
                boxShadow: "0 4px 16px rgba(0,0,0,.15)",
              }}
            >
              <div><strong>Hồ sơ (prototype):</strong> {myId}</div>
              <div style={{ marginTop: 4 }}>Vai: {role === "coach" ? "Coach" : "Học viên"}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => setRole("learner")} style={{ ...btn(dark), fontWeight: role === "learner" ? 700 : 400 }}>
                  Học viên
                </button>
                <button onClick={() => setRole("coach")} style={{ ...btn(dark), fontWeight: role === "coach" ? 700 : 400 }}>
                  Coach
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Báo cáo tiến độ cá nhân:</strong> {viewedCount}/{allLessons.length} bài đã xem
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {allLessons.map((l) => (
                    <li key={l.id}>
                      {progress[l.id] ? "✓" : "○"} {l.title}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: 4, opacity: 0.7, fontSize: 12 }}>
                Dữ liệu từ kho local prototype, không phải production.
              </div>
            </div>
          )}
        </div>
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
              ...(isMobile
                ? {
                    position: "fixed",
                    top: 60,
                    bottom: 0,
                    left: 0,
                    zIndex: 30,
                    overflowY: "auto",
                    boxShadow: "0 4px 16px rgba(0,0,0,.2)",
                  }
                : {}),
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
              onAskRegion={askVision}
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

          {/* Tiến độ + phản hồi theo bài đang xem */}
          <div
            style={{
              marginTop: 12,
              fontSize: 13,
              background: dark ? "#16212c" : "#FFFFFF",
              border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
              borderRadius: 12,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div>
              {progress[activeLesson.lesson.id] ? (
                <span>Đã xem lúc {fmtTime(progress[activeLesson.lesson.id])}.</span>
              ) : (
                <button onClick={markViewed} style={btn(dark)}>Đánh dấu đã xem</button>
              )}{" "}
              <span style={{ opacity: 0.7, fontSize: 12 }}>
                Quy tắc: lượt xem không đồng nghĩa đã hiểu; trạng thái Chưa hiểu do bạn đánh dấu trong bộ ghi chú.
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span>Bài này có hữu ích?</span>
              <button
                onClick={() => setHelpful((p) => ({ ...p, [activeLesson.lesson.id]: true }))}
                style={{ ...btn(dark), fontWeight: helpful[activeLesson.lesson.id] === true ? 700 : 400 }}
              >
                Hữu ích
              </button>
              <button
                onClick={() => setHelpful((p) => ({ ...p, [activeLesson.lesson.id]: false }))}
                style={{ ...btn(dark), fontWeight: helpful[activeLesson.lesson.id] === false ? 700 : 400 }}
              >
                Chưa hữu ích
              </button>
              {confused[activeLesson.lesson.id] && (
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  Đã gửi bối rối: {confused[activeLesson.lesson.id].kind === "kho_hieu" ? "Khó hiểu" : confused[activeLesson.lesson.id].kind === "be_tac" ? "Bế tắc" : "Đã hiểu"}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontSize: 12 }}>
                Phản hồi bối rối (tách khỏi Báo lỗi kỹ thuật):{" "}
                <select value={confuseKind} onChange={(e) => setConfuseKind(e.target.value as typeof confuseKind)}>
                  <option value="">— chọn —</option>
                  <option value="kho_hieu">Khó hiểu</option>
                  <option value="be_tac">Bế tắc</option>
                  <option value="da_hieu">Đã hiểu</option>
                </select>
              </label>
              <input
                value={confuseText}
                onChange={(e) => setConfuseText(e.target.value)}
                placeholder="Ghi thêm (tùy chọn, ẩn danh)…"
                aria-label="Nội dung phản hồi bối rối"
                style={{ ...input(dark), flex: 1, minWidth: 160 }}
              />
              <button onClick={sendConfuse} style={btn(dark)}>Gửi</button>
            </div>
          </div>

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
              ...(isMobile
                ? {
                    position: "fixed",
                    top: 60,
                    bottom: 0,
                    right: 0,
                    zIndex: 30,
                    overflowY: "auto",
                    boxShadow: "0 4px 16px rgba(0,0,0,.2)",
                  }
                : {}),
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(["notes", "ai", "docs", "support"] as PanelTab[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  aria-pressed={tab === k}
                  style={{ ...btn(dark), fontWeight: tab === k ? 700 : 400 }}
                >
                  {k === "notes" ? t.notes : k === "ai" ? t.ai : k === "docs" ? t.docs : t.support}
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
                  <button onClick={openPanel} style={btn(dark)} title="Chọn ghi chú/phạm vi, nhập yêu cầu, AI tổng hợp từ text đã lưu">
                    Tổng hợp
                  </button>
                  <button
                    onClick={() => {
                      setMmErr("");
                      setMmOpen(true);
                    }}
                    style={btn(dark)}
                    title="Chọn ghi chú rồi chuẩn hóa thành sơ đồ nodes/edges, sửa và duyệt riêng"
                  >
                    Sơ đồ
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
                {draftOpen && (
                  <div
                    style={{
                      border: `1px solid #18558B`,
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>AI tổng hợp ghi chú theo yêu cầu</strong>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <label style={{ fontSize: 12 }}>
                        Phạm vi:{" "}
                        <select value={sumScope} onChange={(e) => setSumScope(e.target.value as typeof sumScope)}>
                          <option value="visible">Kết quả đang xem ({visibleItems.length})</option>
                          <option value="lesson">Cả bài hiện tại</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ fontSize: 12, marginTop: 6, maxHeight: 120, overflowY: "auto" }}>
                      Chọn ghi chú ({sumPool().filter((i) => !sumOff[i.id]).length}/{sumPool().length}):
                      {sumPool().map((it) => (
                        <label key={it.id} style={{ display: "block", fontSize: 12, marginTop: 2 }}>
                          <input
                            type="checkbox"
                            checked={!sumOff[it.id]}
                            onChange={(e) =>
                              setSumOff((p) => ({ ...p, [it.id]: !e.target.checked }))
                            }
                          />{" "}
                          {it.title ?? it.id} {it.source.pageNumber ? `(tr.${it.source.pageNumber})` : ""}
                        </label>
                      ))}
                      {sumPool().length === 0 && <span>Không có ghi chú nào trong phạm vi.</span>}
                    </div>
                    <input
                      value={sumInstruction}
                      onChange={(e) => setSumInstruction(e.target.value)}
                      placeholder="Yêu cầu tổng hợp, VD: gom ý chính và điểm chưa hiểu…"
                      aria-label="Yêu cầu tổng hợp"
                      style={{ ...input(dark), width: "100%", marginTop: 6 }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button onClick={() => requestSummary(false)} disabled={sumBusy} style={btn(dark)}>
                        {sumBusy ? "Đang tổng hợp…" : "Gọi AI tổng hợp"}
                      </button>
                      {sumErr && (
                        <button onClick={retrySummary} disabled={sumBusy} style={btn(dark)}>
                          Thử lại
                        </button>
                      )}
                    </div>
                    {sumErr && <div style={{ fontSize: 12, color: "#b42318", marginTop: 4 }}>{sumErr}</div>}
                    {sumRequestId && (
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                        {sumRequestId}{sumMode ? ` · ${sumMode}` : ""}
                      </div>
                    )}
                    {sumSources && sumSources.length > 0 && (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        Nguồn ({sumSources.length}):{" "}
                        {sumSources.map((s) => (
                          <button
                            key={`${s.kind}-${s.refId}`}
                            onClick={() => openSummarySource(s)}
                            style={{ ...btn(dark), marginRight: 6, marginTop: 4 }}
                          >
                            {s.kind === "note" ? "✎" : "📄"} {s.title}
                            {s.page ? ` (tr.${s.page})` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                    <strong style={{ fontSize: 13, display: "block", marginTop: 6 }}>Bản nháp (sửa được — gốc giữ nguyên)</strong>
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      aria-label="Sửa bản tổng hợp"
                      rows={8}
                      style={{ ...input(dark), width: "100%", marginTop: 6 }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button onClick={() => saveDraft("accepted")} style={btn(dark)}>Duyệt & lưu</button>
                      <button onClick={() => saveDraft("pending")} style={btn(dark)}>
                        Để sau
                      </button>
                      <button onClick={() => saveDraft("rejected")} style={btn(dark)}>Bỏ</button>
                    </div>
                  </div>
                )}
                {artifacts.length > 0 && (
                  <details style={{ fontSize: 12 }}>
                    <summary style={{ cursor: "pointer" }}>Bản tổng hợp đã lưu ({artifacts.length})</summary>
                    {artifacts.map((a) => (
                      <div key={a.id} style={{ marginTop: 4, opacity: a.status === "rejected" ? 0.6 : 1 }}>
                        <strong>{a.title}</strong> ·{" "}
                        {a.status === "accepted" ? "Đã duyệt" : a.status === "pending" ? "Nháp" : "Đã bỏ"} ·{" "}
                        {fmtTime(a.createdAt)}
                        {a.mode ? ` · ${a.mode}` : ""}
                        {a.instruction ? <div>Yêu cầu: “{a.instruction}”</div> : null}
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0" }}>{a.draft}</pre>
                        {a.sources && a.sources.length > 0 && (
                          <div>
                            Nguồn ({a.sources.length}):{" "}
                            {a.sources.map((s) => (
                              <button
                                key={`${s.kind}-${s.refId}`}
                                onClick={() => openSummarySource(s)}
                                style={{ ...btn(dark), marginRight: 6, marginTop: 4 }}
                              >
                                {s.kind === "note" ? "✎" : "📄"} {s.title}
                                {s.page ? ` (tr.${s.page})` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </details>
                )}
                {mmOpen && (
                  <div style={{ border: `1px solid #18558B`, borderRadius: 8, padding: 8 }}>
                    <strong style={{ fontSize: 13 }}>Chuẩn hóa sơ đồ (mindmap)</strong>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Dùng đúng ghi chú đã tick chọn ở panel Tổng hợp ({sumPool().filter((i) => !sumOff[i.id]).length} mục).
                      Liên kết suy đoán luôn cần xác nhận trước khi duyệt.
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button onClick={requestMindmap} disabled={mmBusy} style={btn(dark)}>
                        {mmBusy ? "Đang tạo…" : mmProposal ? "Tạo lại" : "Tạo sơ đồ"}
                      </button>
                      <button onClick={() => { setMmOpen(false); }} style={btn(dark)}>Đóng</button>
                    </div>
                    {mmErr && <div style={{ fontSize: 12, color: "#b42318", marginTop: 4 }}>{mmErr}</div>}
                    {mmRequestId && (
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                        {mmRequestId}{mmMode ? ` · ${mmMode}` : ""}
                      </div>
                    )}
                    {mmProposal && (
                      <MindmapEditor
                        proposal={mmProposal}
                        sel={mmSel}
                        onSelect={setMmSel}
                        onLabel={setMmLabel}
                        onDeleteNode={deleteMmNode}
                        onDeleteEdge={deleteMmEdge}
                        onAddEdge={addMmEdge}
                        edgeA={mmEdgeA}
                        edgeB={mmEdgeB}
                        edgeLabel={mmEdgeLabel}
                        setEdgeA={setMmEdgeA}
                        setEdgeB={setMmEdgeB}
                        setEdgeLabel={setMmEdgeLabel}
                        confirmed={mmConfirmed}
                        onConfirm={(i) => setMmConfirmed((p) => ({ ...p, [i]: !p[i] }))}
                        onOpenSource={openMmSource}
                        dark={dark}
                      />
                    )}
                    {mmProposal && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button
                          onClick={() => saveMindmap("accepted")}
                          disabled={mmProposal.uncertainties.filter((_, i) => !mmConfirmed[i]).length > 0}
                          style={btn(dark)}
                          title="Chỉ active sau khi xác nhận mọi điểm chưa rõ"
                        >
                          Duyệt & lưu ({mmProposal.uncertainties.filter((_, i) => !mmConfirmed[i]).length} điểm cần xác nhận)
                        </button>
                        <button onClick={() => saveMindmap("pending")} style={btn(dark)}>Để sau</button>
                        <button onClick={() => saveMindmap("rejected")} style={btn(dark)}>Bỏ</button>
                      </div>
                    )}
                  </div>
                )}
                {mindmaps.length > 0 && (
                  <details style={{ fontSize: 12 }}>
                    <summary style={{ cursor: "pointer" }}>Sơ đồ đã lưu ({mindmaps.length})</summary>
                    {mindmaps.map((m) => (
                      <div key={m.id} style={{ marginTop: 4, opacity: m.status === "rejected" ? 0.6 : 1 }}>
                        <strong>{m.title}</strong> ·{" "}
                        {m.status === "accepted" ? "Đã duyệt" : m.status === "pending" ? "Nháp" : "Đã bỏ"} ·{" "}
                        {fmtTime(m.createdAt)}
                        {m.mode ? ` · ${m.mode}` : ""}
                        <div style={{ opacity: 0.8 }}>
                          {m.proposal.nodes.length} nodes · {m.proposal.edges.length} links ·{" "}
                          {m.itemIds.length} ghi chú gốc (giữ nguyên)
                        </div>
                        {m.sources && m.sources.length > 0 && (
                          <div>
                            Nguồn:{" "}
                            {m.sources.slice(0, 6).map((s) => (
                              <button
                                key={`${s.kind}-${s.refId}`}
                                onClick={() =>
                                  openSummarySource(s as { kind: string; refId: string; title: string; page: number | null; lessonId: string })
                                }
                                style={{ ...btn(dark), marginRight: 6, marginTop: 4 }}
                              >
                                {s.kind === "note" ? "✎" : "📄"} {s.title}
                                {s.page ? ` (tr.${s.page})` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </details>
                )}
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
                {vision && (
                  <div
                    style={{
                      fontSize: 12,
                      border: `1px solid #18558B`,
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <strong>Hỏi AI về vùng đã khoanh (trang {vision.page})</strong>
                    <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "flex-start" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={vision.crop}
                        alt={`Crop vùng trang ${vision.page}`}
                        style={{ maxWidth: 220, borderRadius: 6, border: "1px solid #DCE5ED" }}
                      />
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ opacity: 0.8 }}>
                          Vùng: x {Math.round(vision.rect.x * 100)}%, y {Math.round(vision.rect.y * 100)}%,{" "}
                          {Math.round(vision.rect.w * 100)}×{Math.round(vision.rect.h * 100)}% — crop đúng vùng
                          (không gửi toàn trang). Ảnh chỉ giữ trong phiên.
                        </div>
                        <input
                          value={visQ}
                          onChange={(e) => setVisQ(e.target.value)}
                          placeholder="Hỏi gì về vùng này?…"
                          aria-label="Câu hỏi về vùng đã khoanh"
                          style={{ ...input(dark), width: "100%", marginTop: 6 }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button onClick={() => sendVision(false)} disabled={visBusy} style={btn(dark)}>
                            {visBusy ? "Đang hỏi…" : "Gửi vùng + câu hỏi"}
                          </button>
                          {visErr && (
                            <button onClick={() => sendVision(true)} disabled={visBusy} style={btn(dark)}>
                              Thử lại
                            </button>
                          )}
                          <button onClick={() => setVision(null)} style={btn(dark)}>
                            Bỏ vùng
                          </button>
                        </div>
                        {visErr && <div style={{ color: "#b42318", marginTop: 4 }}>{visErr}</div>}
                      </div>
                    </div>
                  </div>
                )}
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
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12 }}>
                    Lịch sử ({threads.length}):{" "}
                    {threads.length === 0 && <span>chưa có — gửi câu đầu tiên để tạo.</span>}
                    {threads.map((x) => (
                      <span key={x.id} style={{ marginRight: 6 }}>
                        <button
                          onClick={() => setActiveThreadId(x.id)}
                          style={{ ...btn(dark), fontWeight: x.id === activeThreadId ? 700 : 400 }}
                        >
                          {x.title} ({x.messages.length})
                        </button>{" "}
                        <button onClick={() => renameThread(x.id)} style={btn(dark)} aria-label={`Đổi tên ${x.title}`}>
                          ✎
                        </button>{" "}
                        <button onClick={() => deleteThread(x.id)} style={btn(dark)} aria-label={`Xóa ${x.title}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
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
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => (streamOn ? sendAiStream(aiInput) : sendAi())}
                    disabled={aiBusy || streaming}
                    style={btn(dark)}
                  >
                    {t.send}
                  </button>
                  {streaming && (
                    <button
                      onClick={() => streamAbort.current?.abort()}
                      style={btn(dark)}
                    >
                      Dừng
                    </button>
                  )}
                  <label style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={streamOn}
                      onChange={(e) => setStreamOn(e.target.checked)}
                    />{" "}
                    Stream thật (cần provider key)
                  </label>
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
                  <button onClick={() => newThread()} style={btn(dark)}>
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

            {tab === "support" && (
              <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
                <strong>
                  Hỗ trợ labcoach ({role === "coach" ? "góc nhìn Coach" : "góc nhìn Học viên"})
                </strong>
                <span style={{ opacity: 0.75, fontSize: 12 }}>
                  Chạy trong prototype — không gửi tới nhân sự VLearn thật, không cộng điểm production.
                </span>
                {role === "learner" && (
                  <>
                    <label style={{ fontSize: 12 }}>
                      Lớp:{" "}
                      <select value={supClass} onChange={(e) => setSupClass(e.target.value)}>
                        {CLASSES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Loại:{" "}
                      <select value={supKind} onChange={(e) => setSupKind(e.target.value as typeof supKind)}>
                        <option value="HoTro">Hỗ trợ</option>
                        <option value="DiemCong">Điểm cộng</option>
                      </select>
                    </label>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Đính kèm nguồn: {activeLesson.lesson.title} / {activePart.title}
                      {activePart.kind === "pdf" ? ` / trang ${page}` : ""}
                    </div>
                    <textarea
                      value={supText}
                      onChange={(e) => setSupText(e.target.value)}
                      placeholder="Mô tả cần hỗ trợ…"
                      aria-label="Nội dung yêu cầu hỗ trợ"
                      rows={3}
                      style={input(dark)}
                    />
                    <button onClick={sendSupport} style={btn(dark)}>Gửi yêu cầu</button>
                  </>
                )}
                {(role === "coach" ? support : support.filter((r) => r.learnerId === CURRENT_USER_ID)).map((r) => (
                  <article
                    key={r.id}
                    style={{
                      border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`,
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {r.classId} · {r.kind === "HoTro" ? "Hỗ trợ" : "Điểm cộng"} ·{" "}
                      {r.status === "moi" ? "Mới" : r.status === "dang_xu_ly" ? "Đang xử lý" : "Đã trả lời"} ·{" "}
                      {fmtTime(r.createdAt)}
                    </div>
                    <div style={{ fontSize: 13 }}>{r.text}</div>
                    <button
                      onClick={() => {
                        setActiveLessonId(r.lessonId);
                        for (const ch of SEED_COURSE.chapters) {
                          const l = ch.lessons.find((x) => x.id === r.lessonId);
                          if (l) {
                            const p = l.parts.find((x) => x.id === r.partId) ?? l.parts[0];
                            setActivePartId(p.id);
                            break;
                          }
                        }
                        if (r.page) setPage(r.page);
                      }}
                      style={{ ...btn(dark), marginTop: 4 }}
                    >
                      Mở nguồn đính kèm
                    </button>
                    {r.replies.map((m) => (
                      <div key={m.id} style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                        <strong>{m.from === "coach" ? "Coach" : "Học viên"}:</strong> {m.text}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input
                        value={replyDraft[r.id] ?? ""}
                        onChange={(e) => setReplyDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder={role === "coach" ? "Coach trả lời…" : "Học viên bổ sung…"}
                        aria-label="Trả lời hỗ trợ"
                        style={{ ...input(dark), flex: 1, fontSize: 12 }}
                      />
                      <button onClick={() => replySupport(r.id)} style={btn(dark)}>Gửi</button>
                    </div>
                    {role === "coach" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        {(["moi", "dang_xu_ly", "da_tra_loi"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setSupStatus(r.id, s)}
                            style={{ ...btn(dark), fontWeight: r.status === s ? 700 : 400 }}
                          >
                            {s === "moi" ? "Mới" : s === "dang_xu_ly" ? "Đang xử lý" : "Đã trả lời"}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
                {(role === "coach" ? support : support.filter((r) => r.learnerId === CURRENT_USER_ID)).length === 0 && (
                  <span>Chưa có yêu cầu nào.</span>
                )}
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

function MindmapEditor(props: {
  proposal: MindmapProposal;
  sel: string | null;
  onSelect: (id: string | null) => void;
  onLabel: (id: string, label: string) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onAddEdge: () => void;
  edgeA: string;
  edgeB: string;
  edgeLabel: string;
  setEdgeA: (v: string) => void;
  setEdgeB: (v: string) => void;
  setEdgeLabel: (v: string) => void;
  confirmed: Record<number, boolean>;
  onConfirm: (i: number) => void;
  onOpenSource: (refId: string) => void;
  dark: boolean;
}) {
  const { proposal, sel, dark } = props;
  const NW = 150;
  const NH = 46;
  const GX = 24;
  const GY = 64;
  const rest = proposal.nodes.filter((n) => n.id !== "root");
  const root = proposal.nodes.find((n) => n.id === "root");
  const cols = rest.length > 6 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(rest.length / cols));
  const W = cols * (NW + GX) + GX;
  const gridTop = root ? 120 : 16;
  const H = gridTop + rows * (NH + GY);
  const pos = new Map<string, { cx: number; cy: number }>();
  if (root) pos.set("root", { cx: W / 2, cy: 33 });
  rest.forEach((n, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    pos.set(n.id, { cx: GX + c * (NW + GX) + NW / 2, cy: gridTop + r * (NH + GY) + NH / 2 });
  });
  const selNode = proposal.nodes.find((n) => n.id === sel) ?? null;
  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${dark ? "#2a3644" : "#DCE5ED"}`, borderRadius: 8 }}>
        <svg width={W} height={H} role="img" aria-label="Xem trước sơ đồ">
          {proposal.edges.map((e) => {
            const a = pos.get(e.source);
            const b = pos.get(e.target);
            if (!a || !b) return null;
            return (
              <line
                key={e.id}
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke={e.uncertain ? "#b45309" : "#18558B"}
                strokeDasharray={e.uncertain ? "5 4" : undefined}
                strokeWidth={1.5}
              />
            );
          })}
          {proposal.nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const isSel = sel === n.id;
            return (
              <g key={n.id} onClick={() => props.onSelect(isSel ? null : n.id)} style={{ cursor: "pointer" }}>
                <rect
                  x={p.cx - NW / 2}
                  y={p.cy - NH / 2}
                  width={NW}
                  height={NH}
                  rx={8}
                  fill={n.uncertain ? (dark ? "#3a2c10" : "#FEF3C7") : dark ? "#1d2a36" : "#FFFFFF"}
                  stroke={isSel ? "#dc2626" : "#18558B"}
                  strokeWidth={isSel ? 2.5 : 1.5}
                />
                <text x={p.cx} y={p.cy - 2} textAnchor="middle" fontSize={11} fill={dark ? "#e6edf3" : "#203246"}>
                  {short(n.label, 20)}
                </text>
                {n.uncertain && (
                  <text x={p.cx} y={p.cy + 14} textAnchor="middle" fontSize={10} fill="#b45309">
                    ⚠ cần xác nhận
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
        Gốc/đề xuất đối chiếu: bản gốc (ghi chú, ảnh, nét vẽ) không thay đổi — mọi sửa chỉ nằm trên bản đề xuất này.
      </div>
      {selNode && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={selNode.label}
            onChange={(e) => props.onLabel(selNode.id, e.target.value)}
            aria-label="Sửa tên node"
            style={{ ...input(dark), flex: 1, minWidth: 140 }}
          />
          <button onClick={() => props.onOpenSource(selNode.sourceItemId)} style={btn(dark)}>
            Mở nguồn
          </button>
          {selNode.id !== "root" && (
            <button onClick={() => props.onDeleteNode(selNode.id)} style={btn(dark)}>
              Xóa node
            </button>
          )}
        </div>
      )}
      <div style={{ fontSize: 12, marginTop: 6 }}>
        <strong>Liên kết ({proposal.edges.length}):</strong>
        {proposal.edges.map((e) => (
          <div key={e.id} style={{ marginTop: 2 }}>
            {short(props.proposal.nodes.find((n) => n.id === e.source)?.label ?? e.source, 18)} →{" "}
            {short(props.proposal.nodes.find((n) => n.id === e.target)?.label ?? e.target, 18)}
            {e.label ? ` (${e.label})` : ""}
            {e.uncertain ? " · suy đoán" : ""}{" "}
            <button onClick={() => props.onDeleteEdge(e.id)} style={btn(dark)} aria-label={`Xóa liên kết ${e.id}`}>
              ×
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
          <select value={props.edgeA} onChange={(e) => props.setEdgeA(e.target.value)} aria-label="Node nguồn">
            <option value="">— từ —</option>
            {proposal.nodes.map((n) => (
              <option key={n.id} value={n.id}>{short(n.label, 24)}</option>
            ))}
          </select>
          <select value={props.edgeB} onChange={(e) => props.setEdgeB(e.target.value)} aria-label="Node đích">
            <option value="">— tới —</option>
            {proposal.nodes.map((n) => (
              <option key={n.id} value={n.id}>{short(n.label, 24)}</option>
            ))}
          </select>
          <input
            value={props.edgeLabel}
            onChange={(e) => props.setEdgeLabel(e.target.value)}
            placeholder="Nhãn (tùy chọn)"
            aria-label="Nhãn liên kết"
            style={{ ...input(dark), width: 130 }}
          />
          <button onClick={props.onAddEdge} style={btn(dark)}>Thêm link</button>
        </div>
      </div>
      {proposal.uncertainties.length > 0 && (
        <div style={{ fontSize: 12, marginTop: 6 }}>
          <strong>Điểm chưa rõ cần xác nhận ({proposal.uncertainties.length}):</strong>
          {proposal.uncertainties.map((u, i) => (
            <label key={i} style={{ display: "block", marginTop: 2 }}>
              <input type="checkbox" checked={!!props.confirmed[i]} onChange={() => props.onConfirm(i)} />{" "}
              {u.reason}
            </label>
          ))}
        </div>
      )}
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
