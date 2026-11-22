import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Folder,
  Layers3,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api, statuses, taskInput } from "./api";
import type { Project, Status, Task, TaskInput, User } from "./api";

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        // Browsers may force-close on repeated Escape (non-cancelable cancel); reopen if still mounted.
        const dialog = ref.current;
        if (dialog?.isConnected && !dialog.open) dialog.showModal();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="닫기"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Auth({ signedIn }: { signedIn: (user: User) => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      signedIn(
        await api<User>(`/auth/${register ? "register" : "login"}`, "POST", {
          email: form.get("email"),
          password: form.get("password"),
          ...(register ? { name: form.get("name") } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="brand">
          <Layers3 /> 팀 WBS
        </div>
        <div>
          <span className="eyebrow">SMALL TEAM, SHARED PROGRESS</span>
          <h1>
            큰 목표를 나누고,
            <br />
            작은 진척을 함께.
          </h1>
          <p>
            에픽부터 하위 작업까지.
            <br />
            우리 팀이 나아가는 방향을 한곳에서 확인하세요.
          </p>
          <div className="auth-steps">
            <span>01 에픽</span>
            <ChevronRight />
            <span>02 작업</span>
            <ChevronRight />
            <span>03 하위 작업</span>
          </div>
        </div>
        <small>하나의 팀. 함께 완성하는 프로젝트.</small>
      </section>
      <main className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">YOUR TEAM WORKSPACE</span>
          <h2>{register ? "함께 시작해요" : "다시 만나 반가워요"}</h2>
          <p className="muted">
            {register
              ? "계정을 만들고 첫 프로젝트를 시작하세요."
              : "로그인하고 우리 팀의 작업을 이어가세요."}
          </p>
          {register && (
            <label>
              이름
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          )}
          <label>
            이메일
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@team.com"
              required
            />
          </label>
          <label>
            비밀번호
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={10}
              maxLength={128}
              placeholder="10자 이상"
              required
            />
          </label>
          <ErrorMessage message={error} />
          <button className="primary" disabled={busy}>
            {busy ? "처리 중…" : register ? "회원가입" : "로그인"}
            <ArrowUpRight size={18} />
          </button>
          <p className="auth-switch">
            {register ? "이미 계정이 있나요?" : "처음 오셨나요?"}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "로그인" : "회원가입"}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null),
    [error, setError] = useState(""),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const navigate = useNavigate();
  const load = useCallback(() => {
    setError("");
    api<Project[]>("/projects")
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    const data = new FormData(event.currentTarget);
    try {
      const project = await api<Project>("/projects", "POST", {
        name: data.get("name"),
        description: data.get("description"),
      });
      navigate(`/projects/${project.id}`);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <div className="breadcrumb">
        워크스페이스 <span>/</span> 프로젝트
      </div>
      <div className="page-head">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>
            우리 팀의 프로젝트
            <span className="count">{projects?.length ?? "—"}</span>
          </h1>
          <p className="muted">
            목표를 작업으로 나누고, 진행 상황을 함께 확인하세요.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setCreate(true);
            setFormError("");
          }}
        >
          <Plus size={18} /> 새 프로젝트
        </button>
      </div>
      <ErrorMessage message={error} />
      {error && <button onClick={load}>다시 시도</button>}
      {projects === null && !error && (
        <p role="status">프로젝트를 불러오는 중…</p>
      )}
      {projects?.length === 0 && (
        <div className="empty">
          <Folder size={36} />
          <h2>첫 프로젝트를 시작하세요</h2>
          <p>프로젝트를 만들고 팀원과 작업을 나누세요.</p>
          <button onClick={() => setCreate(true)} className="primary">
            <Plus size={18} /> 프로젝트 만들기
          </button>
        </div>
      )}
      <div className="project-grid">
        {projects?.map((p, index) => {
          const total = p.task_count ?? 0,
            done = p.done_count ?? 0,
            percent = total ? Math.round((done / total) * 100) : 0;
          return (
            <Link className="project-card" to={`/projects/${p.id}`} key={p.id}>
              <div className="card-top">
                <span className={`folder-icon color-${index % 3}`}>
                  <Folder size={23} />
                </span>
                <ArrowUpRight size={19} />
              </div>
              <h2>{p.name}</h2>
              <p>{p.description || "프로젝트의 첫 작업을 만들어 보세요."}</p>
              <div className="progress-label">
                <span>전체 작업 진행률</span>
                <strong>{percent}%</strong>
              </div>
              <progress
                value={done}
                max={total || 1}
                aria-label={`${p.name} 완료율`}
              />
              <div className="card-bottom">
                <span>
                  {done} / {total} 완료
                </span>
                <span>WBS 열기 →</span>
              </div>
            </Link>
          );
        })}
      </div>
      {create && (
        <Modal title="새 프로젝트" close={() => !busy && setCreate(false)}>
          <form onSubmit={submit}>
            <label>
              프로젝트 이름
              <input
                name="name"
                placeholder="예: 웹사이트 리뉴얼"
                maxLength={120}
                required
                autoFocus
              />
            </label>
            <label>
              설명
              <textarea
                name="description"
                placeholder="팀이 함께 이루고 싶은 목표"
                maxLength={5000}
                rows={4}
              />
            </label>
            <ErrorMessage message={formError} />
            <div className="form-actions">
              <button
                type="button"
                onClick={() => setCreate(false)}
                disabled={busy}
              >
                취소
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "생성 중…" : "프로젝트 만들기"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
const emptyTask: TaskInput = {
  title: "",
  description: "",
  parent_id: null,
  assignee_id: null,
  status: "todo",
  start_date: null,
  due_date: null,
};
function WBS() {
  const { projectId = "", taskId } = useParams();
  const base = `/projects/${projectId}`;
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [members, setMembers] = useState<User[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set()),
    [newParent, setNewParent] = useState<number | null | undefined>(undefined),
    [team, setTeam] = useState(false),
    [busy, setBusy] = useState(false),
    [memberError, setMemberError] = useState("");
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [p, t, m] = await Promise.all([
        api<Project>(base),
        api<Task[]>(`${base}/tasks`),
        api<User[]>(`${base}/members`),
      ]);
      setProject(p);
      setTasks(t);
      setMembers(m);
      setError("");
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
  const selected = taskId
    ? tasks.find((t) => t.id === Number(taskId))
    : undefined;
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMemberError("");
    const form = event.currentTarget;
    try {
      await api(`${base}/members`, "POST", {
        email: new FormData(form).get("email"),
      });
      form.reset();
      await load();
    } catch (e) {
      setMemberError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function depth(task: Task): number {
    let level = 0,
      parent = task.parent_id;
    while (parent !== null && level < 3) {
      level++;
      parent = tasks.find((t) => t.id === parent)?.parent_id ?? null;
    }
    return level;
  }
  function toggle(id: number) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const complete = tasks.filter((t) => t.status === "done").length,
    active = tasks.filter((t) => t.status === "in_progress").length;
  function rows(parent: number | null, prefix = ""): ReactNode {
    return tasks
      .filter((t) => t.parent_id === parent)
      .map((task, index) => {
        const level = depth(task),
          children = tasks.filter((t) => t.parent_id === task.id),
          number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`,
          member = members.find((m) => m.id === task.assignee_id);
        return (
          <div key={task.id}>
            <div className={`task-row level-${level}`}>
              <div
                className="task-title"
                style={{ paddingLeft: `${level * 24 + 12}px` }}
              >
                {children.length ? (
                  <button
                    className="tree-toggle"
                    aria-label={`${task.title} ${collapsed.has(task.id) ? "펼치기" : "접기"}`}
                    aria-expanded={!collapsed.has(task.id)}
                    onClick={() => toggle(task.id)}
                  >
                    {collapsed.has(task.id) ? (
                      <ChevronRight size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                ) : (
                  <span className="tree-spacer" />
                )}
                <span className={`type-icon type-${level}`}>
                  {level === 0 ? (
                    <Layers3 size={14} />
                  ) : level === 1 ? (
                    <Check size={14} />
                  ) : (
                    <Circle size={10} />
                  )}
                </span>
                <Link to={`${base}/tasks/${task.id}`}>
                  <span className="task-number">{number}</span>
                  {task.title}
                </Link>
              </div>
              <span className="type-label">
                {["에픽", "작업", "하위 작업"][level]}
              </span>
              <span className={`status ${task.status}`}>
                <i />
                {statuses[task.status]}
              </span>
              <span className="assignee">
                {member ? (
                  <>
                    <span className="avatar small">
                      {member.name.slice(0, 1)}
                    </span>
                    <span>{member.name}</span>
                  </>
                ) : (
                  <span className="muted">미지정</span>
                )}
              </span>
              <span className="date-cell">
                {task.start_date?.slice(5) || "—"} <span>→</span>{" "}
                {task.due_date?.slice(5) || "—"}
              </span>
              <span>
                {level < 2 && (
                  <button
                    className="icon-button add-child"
                    aria-label={`${task.title}에 하위 항목 추가`}
                    onClick={() => setNewParent(task.id)}
                  >
                    <Plus size={17} />
                  </button>
                )}
              </span>
            </div>
            {!collapsed.has(task.id) && rows(task.id, number)}
          </div>
        );
      });
  }
  return (
    <main className="workspace">
      <div className="breadcrumb">
        <Link to="/projects">프로젝트</Link>
        <span>/</span>
        {project?.name || "WBS"}
      </div>
      <ErrorMessage message={error} />
      {!project ? (
        <div className="empty">
          {error ? (
            <button onClick={() => void load()}>다시 시도</button>
          ) : (
            <p role="status">작업을 불러오는 중…</p>
          )}
        </div>
      ) : (
        <>
          <div className="page-head">
            <div>
              <span className="eyebrow">
                PROJECT / {String(project.id).padStart(3, "0")}
              </span>
              <h1>{project.name}</h1>
              <p className="muted project-description">
                {project.description || "작업을 나누고 팀과 함께 진행하세요."}
              </p>
            </div>
            <div className="head-actions">
              <button
                onClick={() => {
                  setTeam(true);
                  setMemberError("");
                }}
              >
                <Users size={17} /> 팀원{" "}
                <span className="mini-count">{members.length}</span>
              </button>
              <button className="primary" onClick={() => setNewParent(null)}>
                <Plus size={18} /> 에픽 추가
              </button>
            </div>
          </div>
          <section className="stats" aria-label="진행 상황">
            <div>
              <span>전체 작업</span>
              <strong>
                {tasks.length}
                <small>개</small>
              </strong>
            </div>
            <div>
              <span>
                <i className="dot blue" />
                진행 중
              </span>
              <strong>
                {active}
                <small>개</small>
              </strong>
            </div>
            <div>
              <span>
                <i className="dot green" />
                완료
              </span>
              <strong>
                {complete}
                <small>개</small>
              </strong>
            </div>
            <div className="overall">
              <span>전체 완료율</span>
              <strong>
                {tasks.length ? Math.round((complete / tasks.length) * 100) : 0}
                <small>%</small>
              </strong>
              <progress
                value={complete}
                max={tasks.length || 1}
                aria-label="전체 완료율"
              />
            </div>
          </section>
          <section className="wbs-panel">
            <div className="panel-toolbar">
              <h2>
                <Layers3 size={18} /> 작업 분해 구조{" "}
                <span className="count">{tasks.length}</span>
              </h2>
              <div>
                <button
                  className="quiet"
                  onClick={() => setCollapsed(new Set())}
                >
                  모두 펼치기
                </button>
                <button
                  className="quiet"
                  onClick={() => setCollapsed(new Set(tasks.map((t) => t.id)))}
                >
                  모두 접기
                </button>
                <button
                  className="icon-button"
                  disabled={refreshing}
                  aria-label="새로고침"
                  onClick={() => void load()}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            {tasks.length ? (
              <div className="table-scroll">
                <div className="wbs-table">
                  <div className="table-head">
                    <span>작업 이름</span>
                    <span>유형</span>
                    <span>상태</span>
                    <span>담당자</span>
                    <span>시작일 → 마감일</span>
                    <span />
                  </div>
                  {rows(null)}
                </div>
              </div>
            ) : (
              <div className="empty">
                <Layers3 size={32} />
                <h2>목표를 첫 에픽으로 나누세요</h2>
                <p>에픽을 만든 뒤 작업과 하위 작업을 추가할 수 있어요.</p>
                <button className="primary" onClick={() => setNewParent(null)}>
                  <Plus size={17} /> 첫 에픽 만들기
                </button>
              </div>
            )}
            <div className="panel-footer">
              <span>
                에픽 <ChevronRight size={12} /> 작업 <ChevronRight size={12} />{" "}
                하위 작업
              </span>
              <span>팀과 같은 진행 상황을 보고 있어요</span>
            </div>
          </section>
        </>
      )}
      {team && (
        <Modal title="프로젝트 팀원" close={() => !busy && setTeam(false)}>
          <div className="member-list">
            {members.map((member) => (
              <div className="member" key={member.id}>
                <span className="avatar">{member.name.slice(0, 1)}</span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={addMember}>
            <label>
              가입된 이메일로 팀원 추가
              <input
                name="email"
                type="email"
                placeholder="teammate@team.com"
                required
              />
            </label>
            <p className="muted hint">
              추가된 팀원은 프로젝트와 모든 작업을 함께 편집할 수 있습니다.
            </p>
            <ErrorMessage message={memberError} />
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                {busy ? "추가 중…" : "팀원 추가"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {(newParent !== undefined || selected) && (
        <TaskEditor
          key={selected?.id ?? `new-${newParent}`}
          task={selected}
          initialParent={newParent ?? null}
          tasks={tasks}
          members={members}
          base={base}
          close={() => {
            setNewParent(undefined);
            navigate(base);
          }}
          saved={async () => {
            setNewParent(undefined);
            navigate(base);
            await load();
          }}
        />
      )}
      {taskId && loaded && !selected && (
        <Modal title="작업을 찾을 수 없습니다" close={() => navigate(base)}>
          <p>삭제되었거나 이 프로젝트에 속하지 않는 작업입니다.</p>
          <button onClick={() => navigate(base)}>WBS로 돌아가기</button>
        </Modal>
      )}
    </main>
  );
}
function TaskEditor({
  task,
  initialParent,
  tasks,
  members,
  base,
  close,
  saved,
}: {
  task?: Task;
  initialParent: number | null;
  tasks: Task[];
  members: User[];
  base: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [form, setForm] = useState<TaskInput>(
      task ? taskInput(task) : { ...emptyTask, parent_id: initialParent },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty =
    JSON.stringify(form) !==
    JSON.stringify(
      task ? taskInput(task) : { ...emptyTask, parent_id: initialParent },
    );
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  function cancel() {
    if (!busy && (!dirty || window.confirm("저장하지 않은 변경을 버릴까요?")))
      close();
  }
  function field<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `${base}/tasks${task ? `/${task.id}` : ""}`,
        task ? "PUT" : "POST",
        form,
      );
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const descendants = new Set<number>();
  if (task) {
    descendants.add(task.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of tasks)
        if (
          t.parent_id !== null &&
          descendants.has(t.parent_id) &&
          !descendants.has(t.id)
        ) {
          descendants.add(t.id);
          changed = true;
        }
    }
  }
  async function remove() {
    if (
      !task ||
      !window.confirm(
        `“${task.title}”${descendants.size > 1 ? ` 및 하위 항목 ${descendants.size - 1}개` : ""}를 삭제할까요? 삭제 후 복구할 수 없습니다.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/tasks/${task.id}`, "DELETE");
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        task
          ? "작업 상세 · 편집"
          : form.parent_id === null
            ? "새 에픽"
            : "새 하위 항목"
      }
      close={cancel}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            제목
            <input
              value={form.title}
              onChange={(e) => field("title", e.target.value)}
              maxLength={200}
              placeholder="해야 할 일을 명확하게 적어주세요"
              required
              autoFocus
            />
          </label>
          <label>
            설명
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              maxLength={10000}
              placeholder="목표, 완료 조건, 참고 사항"
            />
          </label>
          <label>
            상위 항목
            <select
              value={form.parent_id ?? ""}
              onChange={(e) =>
                field(
                  "parent_id",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            >
              <option value="">없음 — 에픽으로 만들기</option>
              {tasks
                .filter(
                  (t) =>
                    !descendants.has(t.id) &&
                    (t.parent_id === null ||
                      tasks.find((p) => p.id === t.parent_id)?.parent_id ===
                        null),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.parent_id === null ? "에픽" : "작업"} · {t.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              담당자
              <select
                value={form.assignee_id ?? ""}
                onChange={(e) =>
                  field(
                    "assignee_id",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">미지정</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              상태
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value as Status)}
              >
                {Object.entries(statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              시작일
              <input
                type="date"
                value={form.start_date ?? ""}
                max={form.due_date ?? undefined}
                onChange={(e) => field("start_date", e.target.value || null)}
              />
            </label>
            <label>
              마감일
              <input
                type="date"
                value={form.due_date ?? ""}
                min={form.start_date ?? undefined}
                onChange={(e) => field("due_date", e.target.value || null)}
              />
            </label>
          </div>
          <ErrorMessage message={error} />
          {task && (
            <p className="muted hint">
              마지막 수정 {new Date(task.updated_at).toLocaleString("ko-KR")}
            </p>
          )}
          <div className="form-actions">
            {task && (
              <button
                type="button"
                className="danger"
                onClick={() => void remove()}
              >
                <Trash2 size={16} /> 삭제
              </button>
            )}
            <span className="spacer" />
            <button type="button" onClick={cancel}>
              취소
            </button>
            <button className="primary">
              {busy ? "저장 중…" : task ? "변경 저장" : "만들기"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      setUser(null);
      setError("");
      navigate("/projects");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="loading" role="status">
        워크스페이스를 불러오는 중…
      </div>
    );
  if (!user) return <Auth signedIn={setUser} />;
  return (
    <>
      <header className="app-header">
        <Link to="/projects" className="brand">
          <Layers3 size={25} /> 팀 WBS
        </Link>
        <nav>
          <Link to="/projects">
            <Folder size={16} /> 프로젝트
          </Link>
        </nav>
        <div className="user-menu">
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <span>{user.name}</span>
          <button
            className="icon-button"
            aria-label="로그아웃"
            title="로그아웃"
            onClick={() => void logout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <ErrorMessage message={error} />
      <Routes>
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<WBSRoute />} />
        <Route
          path="/projects/:projectId/tasks/:taskId"
          element={<WBSRoute />}
        />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
      <footer className="app-footer">
        <span>팀 WBS</span>
        <span>작은 작업이 모여, 하나의 목표로.</span>
        <Link to="/projects">
          <ArrowLeft size={13} /> 프로젝트 목록
        </Link>
      </footer>
    </>
  );
}
function WBSRoute() {
  const { projectId } = useParams();
  return <WBS key={projectId} />;
}
