import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

from fastapi.testclient import TestClient
from app.db import connect
from app.main import app, COOKIE, token_hash
from app.migrate import migrate

HEADERS = {'X-WBS-Request': '1'}
PASSWORD = 'correct-horse-123'


class APITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if urlparse(os.environ['DATABASE_URL']).path != '/wbs_test':
            raise RuntimeError('Tests require dedicated wbs_test database; refusing to erase other data.')
        migrate()

    def setUp(self):
        with connect() as db:
            db.execute('TRUNCATE users, projects CASCADE')
        self.owner = TestClient(app, headers=HEADERS)
        self.other = TestClient(app, headers=HEADERS)
        self.owner_user = self.register(self.owner, 'owner@example.com')
        self.other_user = self.register(self.other, 'other@example.com')
        self.project = self.owner.post('/api/projects', json={'name': 'Release'}).json()
        self.base = f"/api/projects/{self.project['id']}"
        self.addCleanup(self.owner.close)
        self.addCleanup(self.other.close)

    def register(self, client, email):
        response = client.post('/api/auth/register', json={'email': email, 'password': PASSWORD, 'name': email.split('@')[0]})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertNotIn('password_hash', response.json())
        return response.json()

    def create(self, parent=None, **overrides):
        data = {'title': 'Task', 'parent_id': parent, **overrides}
        response = self.owner.post(f'{self.base}/tasks', json=data)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def update(self, task, **overrides):
        fields = ('title', 'description', 'parent_id', 'assignee_id', 'status', 'start_date', 'due_date')
        return self.owner.put(f"{self.base}/tasks/{task['id']}", json={**{key: task[key] for key in fields}, **overrides})

    def test_auth_login_logout_and_revocation(self):
        token = self.owner.cookies.get(COOKIE)
        self.assertEqual(self.owner.post('/api/auth/logout').status_code, 204)
        self.assertEqual(self.owner.get('/api/auth/me').status_code, 401)
        self.assertEqual(self.owner.get('/api/auth/me', headers={'Cookie': f'{COOKIE}={token}'}).status_code, 401)
        self.assertEqual(self.owner.post('/api/auth/login', json={'email': 'owner@example.com', 'password': 'incorrect-password'}).status_code, 401)
        response = self.owner.post('/api/auth/login', json={'email': 'OWNER@example.com', 'password': PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertIn('SameSite=strict', response.headers['set-cookie'])
        self.assertEqual(self.owner.get('/api/auth/me').json()['id'], self.owner_user['id'])
        with connect() as db:
            stored = db.execute('SELECT password_hash FROM users WHERE id = %s', (self.owner_user['id'],)).fetchone()['password_hash']
            self.assertTrue(stored.startswith('$argon2'))

    def test_expired_session_and_duplicate_email(self):
        with connect() as db:
            db.execute("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = %s", (token_hash(self.owner.cookies.get(COOKIE)),))
        self.assertEqual(self.owner.get(self.base).status_code, 401)
        response = self.other.post('/api/auth/register', json={'name': 'x', 'email': 'OWNER@example.com', 'password': PASSWORD})
        self.assertEqual(response.status_code, 409)

    def test_all_project_routes_deny_nonmembers(self):
        task = self.create()
        routes = [('GET', self.base, None), ('GET', f'{self.base}/members', None), ('POST', f'{self.base}/members', {'email': 'other@example.com'}), ('GET', f'{self.base}/tasks', None), ('GET', f"{self.base}/tasks/{task['id']}", None), ('POST', f'{self.base}/tasks', {'title': 'Intruder'}), ('PUT', f"{self.base}/tasks/{task['id']}", {'title': 'Intruder'}), ('DELETE', f"{self.base}/tasks/{task['id']}", None)]
        for method, path, body in routes:
            with self.subTest(method=method, path=path):
                self.assertEqual(self.other.request(method, path, json=body).status_code, 404)
        self.assertEqual(self.other.get('/api/projects').json(), [])
        with TestClient(app, headers=HEADERS) as anonymous:
            for method, path, body in routes:
                self.assertEqual(anonymous.request(method, path, json=body).status_code, 401)
        self.assertEqual(self.owner.get(f"{self.base}/tasks/{task['id']}").json()['title'], 'Task')

    def test_member_addition_and_collaboration(self):
        for _ in range(2):
            self.assertEqual(self.owner.post(f'{self.base}/members', json={'email': 'OTHER@example.com'}).status_code, 201)
        self.assertEqual(len(self.owner.get(f'{self.base}/members').json()), 2)
        self.assertEqual(len(self.other.get('/api/projects').json()), 1)
        response = self.other.post(f'{self.base}/tasks', json={'title': 'Collaborative task', 'assignee_id': self.owner_user['id']})
        self.assertEqual(response.status_code, 201)
        task = response.json()
        self.assertEqual(self.update(task, assignee_id=self.other_user['id'], status='done').status_code, 200)
        self.assertEqual(self.other.delete(f"{self.base}/tasks/{task['id']}").status_code, 204)
        self.assertEqual(self.owner.post(f'{self.base}/members', json={'email': 'missing@example.com'}).status_code, 404)

    def test_three_levels_and_fourth_level_rejected(self):
        epic = self.create()
        task = self.create(epic['id'])
        subtask = self.create(task['id'])
        response = self.owner.post(f'{self.base}/tasks', json={'title': 'Fourth level', 'parent_id': subtask['id']})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(len(self.owner.get(f'{self.base}/tasks').json()), 3)

    def test_cross_project_parents_and_task_ids_rejected(self):
        epic = self.create()
        other_project = self.owner.post('/api/projects', json={'name': 'Second'}).json()
        second = f"/api/projects/{other_project['id']}"
        self.assertEqual(self.owner.post(f'{second}/tasks', json={'title': 'Wrong parent', 'parent_id': epic['id']}).status_code, 422)
        other_task = self.owner.post(f'{second}/tasks', json={'title': 'Second task'}).json()
        self.assertEqual(self.update(epic, parent_id=other_task['id']).status_code, 422)
        for method in ('GET', 'PUT', 'DELETE'):
            self.assertEqual(self.owner.request(method, f"{second}/tasks/{epic['id']}", json={'title': 'Wrong path'} if method == 'PUT' else None).status_code, 404)

    def test_cycle_and_descendant_depth_on_reparent(self):
        epic = self.create()
        task = self.create(epic['id'])
        subtask = self.create(task['id'])
        another = self.create()
        self.assertEqual(self.update(epic, parent_id=epic['id']).status_code, 422)
        self.assertEqual(self.update(epic, parent_id=subtask['id']).status_code, 422)
        self.assertEqual(self.update(epic, parent_id=another['id']).status_code, 422)
        self.assertEqual(self.update(task, parent_id=another['id']).status_code, 200)
        self.assertEqual(self.owner.get(f"{self.base}/tasks/{subtask['id']}").json()['parent_id'], task['id'])
        self.assertEqual(self.update(subtask, parent_id=None).status_code, 200)

    def test_create_update_fields_validation_and_rollback(self):
        task = self.create(title='Initial', description='Details', assignee_id=self.owner_user['id'], start_date='2026-09-01', due_date='2026-09-30')
        response = self.update(task, title='Changed', description='Updated', status='in_progress', due_date='2026-10-01')
        self.assertEqual(response.status_code, 200)
        changed = response.json()
        self.assertEqual(changed['title'], 'Changed')
        self.assertEqual(changed['status'], 'in_progress')
        self.assertEqual(changed['due_date'], '2026-10-01')
        for invalid in ({'title': '  '}, {'status': 'unknown'}, {'assignee_id': self.other_user['id']}, {'start_date': '2026-11-01'}, {'due_date': 'not-a-date'}, {'parent_id': 999999}, {'title': 'x' * 201}):
            with self.subTest(invalid=invalid):
                self.assertEqual(self.update(changed, **invalid).status_code, 422)
                self.assertEqual(self.owner.post(f'{self.base}/tasks', json={'title': 'Test', 'due_date': '2026-09-01', **invalid}).status_code, 422)
        self.assertEqual(self.owner.get(f"{self.base}/tasks/{task['id']}").json()['title'], 'Changed')
        cleared = self.update(changed, assignee_id=None, start_date=None, due_date=None, status='done')
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()['assignee_id'])
        self.assertEqual(self.owner.get('/api/projects').json()[0]['done_count'], 1)

    def test_delete_cascades_only_its_subtree(self):
        epic = self.create()
        task = self.create(epic['id'])
        self.create(task['id'])
        sibling = self.create(epic['id'])
        unrelated = self.create()
        self.assertEqual(self.owner.delete(f"{self.base}/tasks/{task['id']}").status_code, 204)
        self.assertEqual({t['id'] for t in self.owner.get(f'{self.base}/tasks').json()}, {epic['id'], sibling['id'], unrelated['id']})
        self.assertEqual(self.owner.delete(f"{self.base}/tasks/{epic['id']}").status_code, 204)
        self.assertEqual([t['id'] for t in self.owner.get(f'{self.base}/tasks').json()], [unrelated['id']])

    def test_csrf_header_and_credential_validation(self):
        with TestClient(app) as client:
            self.assertEqual(client.post('/api/auth/logout').status_code, 403)
            self.assertEqual(client.post('/api/auth/login', json={'email': 'owner@example.com', 'password': PASSWORD}).status_code, 403)
        self.assertEqual(self.owner.post('/api/auth/register', json={'name': 'x', 'email': 'bad', 'password': PASSWORD}).status_code, 422)
        self.assertEqual(self.owner.post('/api/auth/register', json={'name': 'x', 'email': 'x@example.com', 'password': 'short'}).status_code, 422)
        self.assertEqual(self.owner.post('/api/projects', json={'name': '   '}).status_code, 422)

    def test_concurrent_reparent_cannot_create_cycle(self):
        first, second = self.create(), self.create()
        with ThreadPoolExecutor(max_workers=2) as pool:
            one = pool.submit(self.update, first, parent_id=second['id'])
            two = pool.submit(self.update, second, parent_id=first['id'])
            codes = sorted([one.result().status_code, two.result().status_code])
        self.assertEqual(codes, [200, 422])

    def test_migration_is_repeatable(self):
        migrate()
        migrate()
        self.assertEqual(self.owner.get(self.base).status_code, 200)
        with connect() as db:
            self.assertEqual(db.execute('SELECT count(*) AS n FROM schema_migrations').fetchone()['n'], 1)


if __name__ == '__main__':
    unittest.main()
