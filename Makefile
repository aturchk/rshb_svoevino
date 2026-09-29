.PHONY: install test frontend-check prepare check-secrets

install:
	python3 -m venv .venv
	.venv/bin/python -m pip install -e './ml[orb,api,test]'
	cd frontend && npm ci

test:
	.venv/bin/python -m unittest discover -s ml/tests -v
	cd frontend && npm run lint && npm run typecheck && npm test && npm run build

frontend-check:
	cd frontend && npm run lint && npm run typecheck && npm test

prepare:
	.venv/bin/wine-cv prepare-strict --data-root .

check-secrets:
	@if rg -n --hidden --glob '!.git/**' --glob '!work/**' 'rpa_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,}' .; then \
		echo 'Potential secret found' >&2; exit 1; \
	fi
	@echo 'No known token patterns found'
