# 팀 WBS

소규모 팀의 프로젝트 작업 분해와 진행 상황 공유를 위한 MVP입니다. React + TypeScript + Vite, FastAPI, PostgreSQL로 구성됩니다. 운영 이미지는 React 빌드 결과물을 FastAPI에서 제공하므로 한 주소로 화면과 API를 사용합니다.

## 빠른 시작

Docker Desktop 또는 Docker Engine + Docker Compose가 필요합니다. 로컬 Node/Python 설치는 필요하지 않습니다.

```sh
cp .env.example .env
# 개발: Vite HMR + FastAPI 자동 재시작 + PostgreSQL
docker compose --profile dev up --build -d
```

- 웹앱: http://localhost:5173
- API 문서: http://localhost:8000/api/docs
- 상태 확인: http://localhost:8000/api/health
- 첫 시작에는 이미지 다운로드와 의존성 설치로 시간이 걸립니다.

```sh
docker compose --profile dev logs -f api web
# 데이터 보존하며 중지
docker compose --profile dev down
```

### 운영 구성으로 실행 (단일 주소)

개발 구성과 운영 구성은 같은 API 포트를 사용하므로 먼저 개발 구성을 내립니다.

```sh
docker compose --profile dev down
docker compose --profile prod up --build -d
```

웹앱과 API 모두 **http://localhost:8000**에서 제공됩니다. `/projects/1/tasks/1` 같은 상세 URL을 새로고침해도 React가 표시됩니다. 잘못된 `/api/*`와 없는 정적 파일은 404를 반환합니다.

Compose 포트는 기본적으로 로컬 호스트에만 바인딩됩니다. 실제 팀에 공개할 때는 HTTPS 리버스 프록시를 앞에 두고 `.env`의 `COOKIE_SECURE=true`를 설정하세요. 원격 접근은 프록시를 통해 제공합니다. HTTP 로컬 개발에서는 `false`여야 로그인 쿠키가 동작합니다. `POSTGRES_PASSWORD`는 개발용 기본값이므로 배포 전 변경하세요(연결 URL에 쓰이므로 URL 안전한 영숫자 비밀번호 권장). 기존 데이터 볼륨의 DB 비밀번호는 `.env`만 바꿔서는 변경되지 않습니다.

### 테스트

```sh
docker compose --profile test run --build --rm test
# 테스트 DB만 정리 — 개발/운영 데이터에는 영향 없음
docker compose --profile test stop test-db
docker compose --profile test rm -f test-db
```

Python 표준 `unittest`와 FastAPI `TestClient`로 **실제 PostgreSQL**에 요청합니다. 별도 `test-db` 컨테이너와 `wbs_test` DB를 사용하며 DB 이름을 검사한 뒤 테스트 데이터를 초기화합니다. SQLite/mock DB로 대체하지 않습니다.

테스트 항목:

- 회원가입, 중복 이메일, 로그인 실패·성공, 세션 만료, 로그아웃 후 토큰 재사용 차단
- 익명/비구성원의 프로젝트·팀원·작업 읽기/생성/수정/삭제 거부와 프로젝트 목록 격리
- 팀원 추가 후 공동 생성·수정·삭제, 중복 추가의 멱등성
- 에픽 → 작업 → 하위 작업 생성, 4단계 거부
- 다른 프로젝트 부모/작업 ID, 자신/자손 부모 지정, 자손 포함 깊이 초과 거부
- 동시에 서로를 부모로 바꾸는 요청의 순환 생성 방지
- 제목·설명·담당자·상태·날짜 저장, 필드 비우기, 잘못된 입력 거부와 롤백
- 하위 트리 삭제와 형제/다른 에픽 보존
- CSRF 방어용 사용자 지정 헤더, 회원가입 입력 검증
- 마이그레이션 재실행 시 기존 데이터 보존

프론트엔드 타입 검사와 운영 빌드는 `docker compose --profile prod build app`에 포함됩니다. Node가 설치되어 있으면 `cd frontend && npm ci && npm run build`로도 확인할 수 있습니다.

실행 중인 서버의 읽기 전용 HTTP 점검(Python 3 표준 라이브러리만 사용):

```sh
python3 scripts/smoke.py http://localhost:5173 # 개발 구성
python3 scripts/smoke.py http://localhost:8000 # 운영 구성
```

HTML·JS 응답, API 상태, 상세 URL 직접 접속, 미인증 차단, 잘못된 API 경로와 운영 정적 파일의 404를 확인합니다. 개발 Vite의 정적 경로 fallback과 운영 FastAPI의 404 정책은 다르므로 없는 정적 파일 검사는 운영 구성에서만 수행합니다.

## 사용 방법

1. **회원가입**: 이름·이메일·10~128자 비밀번호를 입력합니다. 가입 직후 로그인됩니다.
2. **프로젝트 생성**: 프로젝트 목록에서 `새 프로젝트`를 누릅니다. 만든 사람은 자동으로 팀원이 됩니다.
3. **팀원 추가**: 팀원이 먼저 회원가입한 뒤, 프로젝트 WBS의 `팀원`에서 해당 이메일을 추가합니다. 메일을 보내는 초대 기능은 없습니다.
4. **작업 분해**: `에픽 추가`로 최상위 항목을 만듭니다. 행 오른쪽 `+`로 작업과 하위 작업을 추가합니다.
5. **상세·편집**: 작업 제목을 누르면 제목·설명·부모·담당자·상태·시작일·마감일을 편집합니다. 부모를 바꾸면 유형도 깊이에 맞춰 바뀝니다.
6. **펼치기·접기**: 행 왼쪽 화살표 또는 `모두 펼치기/접기`를 사용합니다. 모바일에서는 WBS 표를 가로 스크롤합니다.
7. **진행 공유**: 전체 작업 수·진행 중·완료·완료율을 확인합니다. 새로고침 버튼이나 창으로 다시 돌아올 때 최신 데이터를 가져옵니다.
8. **삭제**: 상세 화면에서 삭제합니다. 하위 항목도 함께 삭제되며 개수를 포함한 확인창이 표시됩니다. 복구 기능은 없습니다.
9. **로그아웃**: 오른쪽 위 로그아웃 버튼을 누릅니다. 현재 세션은 서버에서도 폐기됩니다.

## 구조와 데이터 모델

```text
backend/
  app/main.py           API, 인증, 권한과 작업 규칙, 운영 정적 서빙
  app/db.py             요청 단위 DB 트랜잭션
  app/migrate.py        버전별 SQL 마이그레이션 실행
  migrations/           변경 불가한 순번 SQL 파일
  tests/test_api.py     PostgreSQL 통합 테스트
frontend/
  src/App.tsx           로그인, 프로젝트 목록, WBS, 상세·편집
  src/api.ts            API 클라이언트와 타입
  src/style.css         반응형 화면
compose.yaml            dev / prod / test 프로필
Dockerfile              React 빌드 → FastAPI 운영 이미지
```

| 테이블 | 역할 / 주요 관계 |
|---|---|
| `users` | 이메일(소문자·고유), 이름, Argon2 비밀번호 해시 |
| `sessions` | 난수 토큰의 SHA-256 해시, 사용자, 7일 만료 시각 |
| `projects` | 이름, 설명, 생성 시각 |
| `project_members` | `(project_id, user_id)` 복합 기본키 |
| `tasks` | 프로젝트, `parent_id`, 제목·설명·담당자·상태·시작일·마감일·수정 시각 |
| `schema_migrations` | 적용된 SQL 파일명과 적용 시각 |

### 설계 선택

- **역할을 나누지 않습니다.** 구성원 모두 팀원 추가와 작업 편집이 가능합니다. 소규모 팀에서 관리 부담을 줄이기 위한 선택입니다. 모든 프로젝트 API는 서버에서 구성원 여부를 확인하며, 없는 프로젝트와 권한 없는 프로젝트를 동일하게 404 처리합니다.
- **깊이가 유형입니다.** 부모가 없으면 에픽(1), 그 자식은 작업(2), 그 자식은 하위 작업(3)입니다. 별도 `type` 필드의 불일치를 피합니다. 수정은 `PUT` 전체 교체 방식입니다.
- **계층 검사는 공통 함수에서 수행합니다.** 부모 존재/프로젝트 일치, 순환, 이동한 항목의 자손 깊이를 검증합니다. 모든 작업 쓰기는 해당 프로젝트 행을 `FOR UPDATE`로 잠근 뒤 검사·저장합니다. 작은 팀에 적합한 단순한 직렬화 방식입니다.
- **DB도 무결성을 보조합니다.** 복합 외래키로 다른 프로젝트 부모 및 비구성원 담당자를 차단합니다. 날짜/상태/제목 제약도 있습니다. 최대 깊이와 순환 검사는 API 책임이므로 작업을 직접 SQL로 쓰지 마세요.
- **세션은 서버 저장 방식입니다.** HttpOnly·SameSite=Strict 쿠키, 운영에서 Secure, DB에는 토큰 해시만 저장합니다. 로그아웃한 토큰은 재사용할 수 없습니다. 쓰기 요청의 `X-WBS-Request: 1` 헤더를 요구하고 CORS를 열지 않아 다른 출처의 브라우저 요청을 차단합니다. 개발에서도 Vite가 `/api`를 프록시해 같은 출처를 유지합니다.
- **진행률은 모든 계층의 완료 항목 수 / 전체 항목 수**입니다. 부모의 상태는 자동 변경하지 않습니다. 가중치·부모별 롤업 계산은 포함하지 않습니다.
- **외부 서비스가 필요 없습니다.** 초대 메일 대신 가입 이메일로 추가하며, 별도 UI 프레임워크·ORM 없이 PostgreSQL 매개변수 SQL과 브라우저 기본 폼/날짜 입력/다이얼로그를 사용합니다.

구현 참고: [FastAPI yield 의존성](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/), [PostgreSQL 행 잠금](https://www.postgresql.org/docs/16/explicit-locking.html).

## 마이그레이션 및 데이터 보존

API/운영 컨테이너 시작 시 `python -m app.migrate`가 자동 실행됩니다. `backend/migrations/001_initial.sql`이 최초 스키마입니다. 마이그레이션 전체는 트랜잭션에서 실행되며 advisory lock으로 동시 적용을 방지합니다. 실패하면 시작을 중단하고 롤백합니다.

수동 적용:

```sh
docker compose --profile dev exec api python -m app.migrate
# 운영에서는 api 대신 app
docker compose --profile prod exec app python -m app.migrate
```

스키마 변경 시 기존 SQL을 수정하지 말고 `002_설명.sql`처럼 새 파일을 추가하세요. 자동 downgrade는 지원하지 않습니다. 변경 전 백업하고, 필요하면 보정 마이그레이션이나 백업 복원을 사용합니다.

```sh
# 백업
docker compose exec -T db pg_dump -U wbs -d wbs > backup.sql
```

`postgres_data` 이름의 Compose 볼륨에 앱 데이터가 보존됩니다. `docker compose down`은 데이터를 지우지 않습니다. **`down -v`는 데이터를 영구 삭제**하므로 초기화가 필요한 경우에만 사용하세요.

## 현재 한계

- 소규모 팀의 내부 사용을 위한 MVP입니다. 이메일 인증·비밀번호 재설정·회원 탈퇴·프로젝트 삭제·팀원 제거·세부 역할·로그인 시도 제한·감사 로그는 없습니다. 인터넷 공개 전 인증 운영 정책과 로그인 rate limit을 추가해야 합니다.
- 자동 실시간 동기화/WebSocket은 없습니다. 수동 새로고침 또는 창 포커스 복귀로 갱신합니다.
- 동일 작업의 내용 동시 편집은 마지막 저장이 적용됩니다. 계층의 무결성은 잠금으로 보장하지만 편집 버전 충돌 UI는 없습니다.
- 프로젝트의 작업을 한 번에 읽으며 페이지네이션/가상 스크롤이 없습니다. 작업 수가 많아지면 DB 재귀 질의와 가상화가 필요합니다.
- 삭제는 하위 트리를 포함한 영구 삭제입니다. 변경 이력·휴지통·첨부 파일·댓글은 없습니다.
- 개발과 운영 실행 모두 단일 앱 인스턴스를 기본으로 합니다. 자동 백업·TLS 발급·모니터링은 배포 환경에서 구성해야 합니다.
- 간트 차트, 자동화, AI, Jira 연동, 외부 유료 서비스는 포함하지 않습니다.

## 구현 시 검증 결과 (2026-09-24)

- Docker Compose + 실제 PostgreSQL 통합 테스트: **12개 통과**.
- TypeScript 검사와 Vite 운영 빌드: **통과** (운영 Docker 멀티스테이지 빌드에서도 확인).
- 개발 `localhost:5173`과 운영 `localhost:8000` 읽기 전용 HTTP 점검: **통과**.
- 운영 앱/DB 컨테이너 healthcheck: **정상**.
- 브라우저 클릭 시나리오 및 화면 크기별 시각 검증은 별도로 수행하지 않았습니다.
# pj_wbs
