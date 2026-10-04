// N06 — Chuẩn hóa mindmap (server-side).
// "Chuẩn hóa" mặc định: đọc chữ, căn bố cục, giữ liên kết. KHÔNG tự bổ sung
// edges suy đoán — mọi liên kết suy đoán vào `uncertain` + `uncertainties`,
// yêu cầu user xác nhận trước khi duyệt. Ảnh/nét vẽ chưa qua vision model
// được đánh dấu uncertain, không bịa confidence %.

import { stripVi } from "./text";

export interface MindmapNode {
  id: string;
  label: string;
  sourceItemId: string;
  uncertain: boolean;
}

export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  uncertain: boolean;
}

export interface MindmapUncertainty {
  nodeId?: string;
  edgeId?: string;
  reason: string;
}

export interface MindmapProposal {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  uncertainties: MindmapUncertainty[];
}

export interface MindmapNoteInput {
  id: string;
  title?: string;
  body?: string;
  quote?: string;
  kind?: string;
  lessonId?: string;
  pageNumber?: number;
}

const STOP = new Set(
  "là gì cái các những một những và với của trong cho từ đến khi để có không được này kia đó đây nào sao thế nào bao nhiêu tại sao làm thế vì hãy cho tôi em anh chị bạn mình ơi ạ nhé vâng xin chào hello hi ai giảng ơi trang bài học phần ghi chú chưa hiểu giải thích tóm tắt tắt ví dụ thêm về của cho hay gom tổng hợp hợp lại giúp đồ sơ".split(
    " ",
  ),
);

function keywords(s: string): string[] {
  return stripVi(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOP.has(w));
}

const clip = (x: string, n: number) => (x.length > n ? `${x.slice(0, n)}…` : x);

function nodeLabel(n: MindmapNoteInput): string {
  return clip((n.title || n.body || n.quote || n.id).trim(), 60);
}

// Validate nghiêm ngặt: server reject dangling edges, trùng ID, schema sai.
export function validateProposal(p: MindmapProposal): string[] {
  const errs: string[] = [];
  if (!p || !Array.isArray(p.nodes) || !Array.isArray(p.edges) || !Array.isArray(p.uncertainties)) {
    return ["Proposal sai schema: cần nodes/edges/uncertainties là mảng."];
  }
  const ids = new Set<string>();
  for (const n of p.nodes) {
    if (!n || typeof n.id !== "string" || !n.id) errs.push("Node thiếu id.");
    else if (ids.has(n.id)) errs.push(`Trùng node id: ${n.id}.`);
    else ids.add(n.id);
    if (!n || typeof n.label !== "string" || !n.label.trim()) errs.push(`Node ${n?.id ?? "?"} trống label.`);
    if (!n || typeof n.sourceItemId !== "string" || !n.sourceItemId)
      errs.push(`Node ${n?.id ?? "?"} thiếu sourceItemId.`);
  }
  const eids = new Set<string>();
  for (const e of p.edges) {
    if (!e || typeof e.id !== "string" || !e.id) errs.push("Edge thiếu id.");
    else if (eids.has(e.id)) errs.push(`Trùng edge id: ${e.id}.`);
    else eids.add(e.id);
    if (e && !ids.has(e.source)) errs.push(`Edge ${e.id} trỏ source không tồn tại: ${e.source}.`);
    if (e && !ids.has(e.target)) errs.push(`Edge ${e.id} trỏ target không tồn tại: ${e.target}.`);
  }
  if (p.nodes.length > 60) errs.push("Đồ thị quá lớn (>60 nodes) — thu hẹp phạm vi.");
  return errs;
}

export function buildLocalProposal(
  notes: MindmapNoteInput[],
  scopeTitle: string,
  kbTitles: { id: string; title: string; page: number }[],
): MindmapProposal {
  const nodes: MindmapNode[] = [
    { id: "root", label: clip(scopeTitle, 60), sourceItemId: "scope", uncertain: false },
  ];
  const uncertainties: MindmapUncertainty[] = [];
  const edges: MindmapEdge[] = [];

  notes.forEach((n, i) => {
    const id = `n${i}-${n.id.slice(0, 8)}`;
    const unreadable = n.kind === "ink" || n.kind === "image";
    const empty = !(n.title || n.body || n.quote);
    const uncertain = unreadable || empty;
    nodes.push({ id, label: nodeLabel(n), sourceItemId: n.id, uncertain });
    edges.push({ id: `e-root-${id}`, source: "root", target: id, uncertain: false });
    if (unreadable)
      uncertainties.push({
        nodeId: id,
        reason: `Nội dung ${n.kind === "ink" ? "nét vẽ" : "ảnh"} chưa đọc bằng vision model — xác nhận tên node trước khi duyệt.`,
      });
    if (empty)
      uncertainties.push({ nodeId: id, reason: "Ghi chú trống nội dung — xác nhận hoặc bỏ node." });
  });

  // Liên kết giữa các note theo cụm từ chung (bigram) hoặc từ dài (≥8) —
  // LUÔN uncertain (suy đoán). Từ đơn ngắn dễ trùng ngẫu nhiên nên không dùng.
  const phrases = (n: MindmapNoteInput): Set<string> => {
    const ks = keywords(`${n.title ?? ""} ${n.body ?? ""} ${n.quote ?? ""}`);
    const out = new Set<string>();
    for (let i = 0; i < ks.length - 1; i++)
      if (ks[i].length >= 4 && ks[i + 1].length >= 4) out.add(`${ks[i]} ${ks[i + 1]}`);
    for (const k of ks) if (k.length >= 8) out.add(k);
    return out;
  };
  const keysets = notes.map(phrases);
  notes.forEach((a, i) => {
    notes.forEach((b, j) => {
      if (j <= i) return;
      const shared = [...keysets[i]].find((k) => keysets[j].has(k));
      if (shared) {
        const eid = `e-${i}-${j}`;
        edges.push({
          id: eid,
          source: nodes[i + 1].id,
          target: nodes[j + 1].id,
          label: shared,
          uncertain: true,
        });
        uncertainties.push({
          edgeId: eid,
          reason: `Liên kết theo từ khóa “${shared}” do AI suy đoán — xác nhận hoặc xóa.`,
        });
      }
    });
  });

  // Bối cảnh tài liệu: tối đa 2 node KB (không suy đoán thêm).
  kbTitles.slice(0, 2).forEach((k, i) => {
    const id = `kb${i}`;
    nodes.push({ id, label: clip(k.title, 60), sourceItemId: k.id, uncertain: false });
    edges.push({ id: `e-root-${id}`, source: "root", target: id, label: `tr.${k.page}`, uncertain: false });
  });

  return { nodes, edges, uncertainties };
}
