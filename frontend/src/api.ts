export type User = { id: number; name: string; email: string };
export type Project = {
  id: number;
  name: string;
  description: string;
  task_count?: number;
  done_count?: number;
};
export type Status = "todo" | "in_progress" | "done";
export type Task = {
  id: number;
  project_id: number;
  title: string;
  description: string;
  parent_id: number | null;
  assignee_id: number | null;
  status: Status;
  start_date: string | null;
  due_date: string | null;
  updated_at: string;
};
export type TaskInput = Omit<Task, "id" | "project_id" | "updated_at">;
export const statuses: Record<Status, string> = {
  todo: "할 일",
  in_progress: "진행 중",
  done: "완료",
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-WBS-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : response.status === 422
          ? "입력 내용을 확인해 주세요. 제목·날짜·이메일 형식을 확인해 주세요."
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function taskInput(task: Task): TaskInput {
  const {
    title,
    description,
    parent_id,
    assignee_id,
    status,
    start_date,
    due_date,
  } = task;
  return {
    title,
    description,
    parent_id,
    assignee_id,
    status,
    start_date,
    due_date,
  };
}
