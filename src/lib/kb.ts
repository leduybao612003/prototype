// Tri thức trích từ file PDF mẫu "3B-Zone2-BLAS-HackathonPresentation.pdf"
// (slide hackathon AI20k LAB Workflow Guide Agent, 11 trang).
// Dùng cho AI prototype nội bộ khi KB ingestion chưa sẵn sàng.

export interface KbSection {
  id: string;
  lessonId: string;
  page: number;
  title: string;
  text: string;
}

export const KB_SECTIONS: KbSection[] = [
  {
    id: "kb-cover",
    lessonId: "blas-cover",
    page: 1,
    title: "Cover — AI20k LAB Workflow Guide Agent",
    text: "Agent tổng hợp các file markdown, guide, yêu cầu bài tập và checkpoint trong chương trình AI20k. Tên nhóm 3B, Zone 2, BLAS, tháng 9/2026.",
  },
  {
    id: "kb-survey",
    lessonId: "blas-cover",
    page: 3,
    title: "Overview — Internal Survey",
    text: "Khảo sát nội bộ về khó khăn của học viên khi đọc hiểu file markdown hướng dẫn lab (kết quả chi tiết trong bảng tính nội bộ).",
  },
  {
    id: "kb-feasibility",
    lessonId: "blas-feasibility",
    page: 4,
    title: "Product Feasibility — Problem statement",
    text: "Học viên non-tech tại khóa AI thực chiến gặp khó khăn khi đọc hiểu các file markdown hướng dẫn để hoàn thành lab: đâu là yêu cầu bắt buộc, đâu là phần gợi ý, quy trình các bước nào cần thực hiện, các tiêu chí cần đạt sau mỗi bước. Việc này gây mất thời gian, dễ bỏ sót yêu cầu hoặc thực hiện sai flow. 91% học viên được phỏng vấn sẵn sàng sử dụng sản phẩm. Giải pháp: xây dựng Agent tổng hợp các file Markdown, guide, yêu cầu bài tập và checkpoint thành một workflow có cấu trúc, đồng thời cho phép học viên hỏi về yêu cầu và nhận hướng dẫn cho bước tiếp theo dựa trên tài liệu chính thức. User là học viên non-tech, JTBD là đọc hướng dẫn và thực hành Lab.",
  },
  {
    id: "kb-competitors",
    lessonId: "blas-solution",
    page: 6,
    title: "Competitors — NotebookLM & ChatGPT Study Space",
    text: "NotebookLM tổng hợp và liên kết thông tin từ nhiều nguồn tài liệu trong cùng một không gian làm việc, trả lời câu hỏi có trích dẫn để kiểm chứng nguồn. Ranh giới: không xây thêm công cụ tóm tắt đa mục đích, mà chuyển các file markdown trong repository thành workflow có thứ tự, task, output và tiêu chí hoàn thành. ChatGPT Study Space chia nhỏ nội dung phức tạp, đặt câu hỏi gợi mở và điều chỉnh giải thích theo phản hồi. Ranh giới: không xây gia sư đa môn, mà hướng dẫn học viên thực hiện bước tiếp theo dựa trên trạng thái thực tế của bài lab.",
  },
  {
    id: "kb-slice",
    lessonId: "blas-solution",
    page: 7,
    title: "AI Slice và ranh giới Must/Must not",
    text: "AI Slice: một học viên đang thực hiện Lab cần xác định các bước cụ thể để hoàn thành bài; AI tổng hợp và trả lời dựa trên các file Markdown được cung cấp, chỉ đưa ra hướng dẫn khi truy xuất được nguồn tương ứng, kết quả trả về phải kèm tên file cùng trích đoạn nguồn cụ thể. Must: tổng hợp, loại trùng, sắp xếp workflow, tạo LAB_GUIDE.md, Q&A có căn cứ từ tài liệu. Must not: chạy code, sửa repo, tự thêm requirement, suy đoán hoặc tự quyết khi tài liệu mâu thuẫn. Uncertain: thiếu thông tin hoặc mâu thuẫn thì báo cho học viên và yêu cầu xác nhận.",
  },
  {
    id: "kb-ui",
    lessonId: "blas-ui",
    page: 8,
    title: "UI Overview — 4 bước sử dụng",
    text: "1. Tải repository: hệ thống đọc và lập chỉ mục các file Markdown làm nguồn cho hướng dẫn và câu trả lời. 2. Xem workflow: tài liệu được tổng hợp thành danh sách bước theo thứ tự ở panel bên phải. 3. Làm theo Current Step: bước đang thực hiện, là ngữ cảnh chính khi hỏi AI tôi nên làm gì tiếp theo hoặc bước này hoàn thành khi nào. 4. Tham khảo Viewing Step: có thể mở bước trước hoặc sau để xem chi tiết; thao tác này không thay đổi tiến độ.",
  },
  {
    id: "kb-validation",
    lessonId: "blas-validation",
    page: 10,
    title: "Validation — User Testing",
    text: "Tổng thể 83,3% test case đạt (ngưỡng 83%). Extraction completeness 92%, step order accuracy 95%, answer completeness 91%, answer accuracy 91,7%, step status accuracy 100%, false completion rate 0%. Chưa đạt: grounded conclusion rate 87,5% (ngưỡng 95%) do chưa kiểm tra nguồn trước khi trả lời; citation accuracy 87,5%; hallucination rate 12,5% và fabricated source rate 8,3% do AI tự bổ sung thông tin khi tài liệu thiếu. Người thử đánh giá giao diện dễ dùng nhưng cả hai vẫn cần AI khác và một người gặp bug.",
  },
];

export function sectionsForLesson(lessonId: string): KbSection[] {
  return KB_SECTIONS.filter((s) => s.lessonId === lessonId);
}
