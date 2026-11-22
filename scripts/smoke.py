"""Read-only HTTP checks against a running dev or production Compose stack."""
import json
import re
import sys
from urllib.error import HTTPError
from urllib.request import urlopen

base = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000').rstrip('/')


def get(path, expected=200):
    try:
        response = urlopen(base + path, timeout=10)
    except HTTPError as error:
        response = error
    assert response.status == expected, (path, response.status, expected)
    return response.read().decode()


assert json.loads(get('/api/health')) == {'status': 'ok'}
html = get('/')
assert 'id="root"' in html
entries = re.findall(r'<script[^>]+src="([^"]+)"', html)
assert entries, 'Missing frontend entrypoint'
for entry in entries:
    assert '<!doctype html>' not in get(entry).lower()
assert 'id="root"' in get('/projects/1/tasks/1')
get('/api/projects', 401)
get('/api/does-not-exist', 404)
if any(entry.startswith('/assets/') for entry in entries):
    get('/assets/does-not-exist.js', 404)
print(f'PASS: {base} — health, HTML, JS, deep link, authentication, API 404 (asset 404 in production)')
