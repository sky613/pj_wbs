import hashlib
import os
import secrets
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pwdlib import PasswordHash

from app.db import get_db

app = FastAPI(title='팀 WBS', docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url=None)
passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash('dummy-password-for-timing')
COOKIE = 'wbs_session'
SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'


@app.middleware('http')
async def csrf_guard(request: Request, call_next):
    # A custom header cannot be sent cross-origin without a CORS preflight.
    # No CORS middleware is enabled; Vite proxies /api from the same origin.
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} and request.headers.get('X-WBS-Request') != '1':
        return JSONResponse({'detail': '잘못된 요청입니다. 페이지를 새로고침해 주세요.'}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    return response


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Credentials(Input):
    email: EmailStr
    # Preserve password whitespace rather than silently changing credentials.
    password: str = Field(min_length=10, max_length=128)

    @field_validator('password', mode='wrap')
    @classmethod
    def password_verbatim(cls, value, handler):
        if not isinstance(value, str) or not 10 <= len(value) <= 128:
            raise ValueError('비밀번호는 10~128자여야 합니다.')
        return value


class Registration(Credentials):
    name: str = Field(min_length=1, max_length=80)


class ProjectInput(Input):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=5000)


class MemberInput(Input):
    email: EmailStr


class TaskInput(Input):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default='', max_length=10000)
    parent_id: int | None = Field(default=None, gt=0)
    assignee_id: int | None = Field(default=None, gt=0)
    status: Literal['todo', 'in_progress', 'done'] = 'todo'
    start_date: date | None = None
    due_date: date | None = None


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(request: Request, db=Depends(get_db, scope="function")):
    token = request.cookies.get(COOKIE, '')
    user = db.execute('SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = %s AND s.expires_at > now()', (token_hash(token),)).fetchone()
    if not user:
        raise HTTPException(401, '로그인이 필요합니다.')
    return user


def new_session(db, response, user_id, request):
    old = request.cookies.get(COOKIE)
    if old:
        db.execute('DELETE FROM sessions WHERE token_hash = %s', (token_hash(old),))
    db.execute('DELETE FROM sessions WHERE expires_at <= now()')
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO sessions VALUES (%s, %s, now() + interval '7 days')", (token_hash(token), user_id))
    response.set_cookie(COOKIE, token, max_age=604800, httponly=True, secure=SECURE, samesite='strict', path='/')


def project_access(db, project_id, user_id, lock=False):
    project = db.execute('SELECT p.* FROM projects p JOIN project_members m ON m.project_id = p.id WHERE p.id = %s AND m.user_id = %s' + (' FOR UPDATE OF p' if lock else ''), (project_id, user_id)).fetchone()
    if not project:
        raise HTTPException(404, '프로젝트를 찾을 수 없거나 접근 권한이 없습니다.')
    return project


def task_in_project(db, project_id, task_id):
    task = db.execute('SELECT * FROM tasks WHERE project_id = %s AND id = %s', (project_id, task_id)).fetchone()
    if not task:
        raise HTTPException(404, '작업을 찾을 수 없습니다.')
    return task


def validate_task(db, project_id, data, task_id=None):
    if data.start_date and data.due_date and data.start_date > data.due_date:
        raise HTTPException(422, '마감일은 시작일보다 빠를 수 없습니다.')
    if data.assignee_id and not db.execute('SELECT 1 FROM project_members WHERE project_id = %s AND user_id = %s', (project_id, data.assignee_id)).fetchone():
        raise HTTPException(422, '담당자는 프로젝트 팀원이어야 합니다.')
    parents = {r['id']: r['parent_id'] for r in db.execute('SELECT id, parent_id FROM tasks WHERE project_id = %s', (project_id,)).fetchall()}
    if data.parent_id is not None and data.parent_id not in parents:
        raise HTTPException(422, '상위 항목은 같은 프로젝트에 있어야 합니다.')
    # ponytail: small-team trees are scanned in memory; use a recursive CTE for large projects.
    parents[task_id if task_id is not None else 0] = data.parent_id
    for node in parents:
        seen = set()
        while node is not None:
            if node in seen:
                raise HTTPException(422, '자기 자신 또는 하위 항목을 부모로 지정할 수 없습니다.')
            seen.add(node)
            if len(seen) > 3:
                raise HTTPException(422, '에픽 → 작업 → 하위 작업의 3단계까지만 허용됩니다.')
            node = parents[node]


@app.get('/api/health')
def health(db=Depends(get_db, scope="function")):
    db.execute('SELECT 1')
    return {'status': 'ok'}


@app.post('/api/auth/register', status_code=201)
def register(data: Registration, request: Request, response: Response, db=Depends(get_db, scope="function")):
    try:
        user = db.execute('INSERT INTO users(email, name, password_hash) VALUES (%s, %s, %s) RETURNING id, name, email', (str(data.email).lower(), data.name, passwords.hash(data.password))).fetchone()
    except UniqueViolation:
        raise HTTPException(409, '이미 가입된 이메일입니다.')
    new_session(db, response, user['id'], request)
    return user


@app.post('/api/auth/login')
def login(data: Credentials, request: Request, response: Response, db=Depends(get_db, scope="function")):
    user = db.execute('SELECT * FROM users WHERE email = %s', (str(data.email).lower(),)).fetchone()
    valid = passwords.verify(data.password, user['password_hash'] if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, '이메일 또는 비밀번호를 확인해 주세요.')
    new_session(db, response, user['id'], request)
    return {key: user[key] for key in ('id', 'name', 'email')}


@app.post('/api/auth/logout', status_code=204)
def logout(request: Request, response: Response, db=Depends(get_db, scope="function")):
    db.execute('DELETE FROM sessions WHERE token_hash = %s', (token_hash(request.cookies.get(COOKIE, '')),))
    response.delete_cookie(COOKIE, path='/', secure=SECURE, httponly=True, samesite='strict')


@app.get('/api/auth/me')
def me(user=Depends(current_user)):
    return user


@app.get('/api/projects')
def projects(user=Depends(current_user), db=Depends(get_db, scope="function")):
    return db.execute('SELECT p.*, (SELECT count(*) FROM tasks t WHERE t.project_id = p.id) AS task_count, (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.status = \'done\') AS done_count FROM projects p JOIN project_members m ON p.id = m.project_id WHERE m.user_id = %s ORDER BY p.id DESC', (user['id'],)).fetchall()


@app.post('/api/projects', status_code=201)
def create_project(data: ProjectInput, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project = db.execute('INSERT INTO projects(name, description) VALUES (%s, %s) RETURNING *', (data.name, data.description)).fetchone()
    db.execute('INSERT INTO project_members VALUES (%s, %s)', (project['id'], user['id']))
    return project


@app.get('/api/projects/{project_id}')
def get_project(project_id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    return project_access(db, project_id, user['id'])


@app.get('/api/projects/{project_id}/members')
def members(project_id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project_access(db, project_id, user['id'])
    return db.execute('SELECT u.id, u.name, u.email FROM users u JOIN project_members m ON m.user_id = u.id WHERE m.project_id = %s ORDER BY u.id', (project_id,)).fetchall()


@app.post('/api/projects/{project_id}/members', status_code=201)
def add_member(project_id: int, data: MemberInput, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project_access(db, project_id, user['id'], lock=True)
    member = db.execute('SELECT id, name, email FROM users WHERE email = %s', (str(data.email).lower(),)).fetchone()
    if not member:
        raise HTTPException(404, '해당 이메일로 가입한 사용자가 없습니다. 먼저 회원가입해 주세요.')
    db.execute('INSERT INTO project_members VALUES (%s, %s) ON CONFLICT DO NOTHING', (project_id, member['id']))
    return member


@app.get('/api/projects/{project_id}/tasks')
def tasks(project_id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project_access(db, project_id, user['id'])
    return db.execute('SELECT * FROM tasks WHERE project_id = %s ORDER BY id', (project_id,)).fetchall()


@app.get('/api/projects/{project_id}/tasks/{task_id}')
def get_task(project_id: int, task_id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project_access(db, project_id, user['id'])
    return task_in_project(db, project_id, task_id)


@app.post('/api/projects/{project_id}/tasks', status_code=201)
def create_task(project_id: int, data: TaskInput, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project_access(db, project_id, user['id'], lock=True)
    validate_task(db, project_id, data)
    return db.execute('INSERT INTO tasks(project_id, title, description, parent_id, assignee_id, status, start_date, due_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *', (project_id, data.title, data.description, data.parent_id, data.assignee_id, data.status, data.start_date, data.due_date)).fetchone()


@app.put('/api/projects/{project_id}/tasks/{task_id}')
def update_task(project_id: int, task_id: int, data: TaskInput, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project_access(db, project_id, user['id'], lock=True)
    task_in_project(db, project_id, task_id)
    validate_task(db, project_id, data, task_id)
    return db.execute('UPDATE tasks SET title = %s, description = %s, parent_id = %s, assignee_id = %s, status = %s, start_date = %s, due_date = %s, updated_at = now() WHERE project_id = %s AND id = %s RETURNING *', (data.title, data.description, data.parent_id, data.assignee_id, data.status, data.start_date, data.due_date, project_id, task_id)).fetchone()


@app.delete('/api/projects/{project_id}/tasks/{task_id}', status_code=204)
def delete_task(project_id: int, task_id: int, user=Depends(current_user), db=Depends(get_db, scope="function")):
    project_access(db, project_id, user['id'], lock=True)
    task_in_project(db, project_id, task_id)
    db.execute('DELETE FROM tasks WHERE project_id = %s AND id = %s', (project_id, task_id))


# Mount only built public files. API typos and missing assets must remain 404s.
static_dir = Path(os.getenv('STATIC_DIR', '/app/static'))
if static_dir.is_dir():
    app.mount('/assets', StaticFiles(directory=static_dir / 'assets'), name='assets')

    @app.get('/{path:path}', include_in_schema=False)
    def spa(path: str):
        if path == '' or path == 'projects' or (path.startswith('projects/') and all(part.isdigit() or part == 'tasks' for part in path.split('/')[1:])):
            return FileResponse(static_dir / 'index.html')
        raise HTTPException(404, '찾을 수 없습니다.')
