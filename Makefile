.PHONY: check-node install demo local-setup local october-test test frontend-check \
	prepare validate-data smoke-demo acceptance-preflight acceptance-run release-check \
	check-secrets

check-node:
	@node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) { console.error(`Node >=22.12 required; found $${process.versions.node}. Run: cd frontend && nvm use`); process.exit(1) }'

install: check-node
	python3 -m venv .venv
	.venv/bin/python -m pip install -e './ml[orb,api,test]'
	cd frontend && npm ci

demo: check-node
	cd frontend && NUXT_PUBLIC_DEMO_SCAN=true npm run dev

local-setup:
	ml/scripts/local_setup.sh

local:
	ml/scripts/local_stack.sh

october-test:
	ml/scripts/october_test.sh

test: check-node validate-data
	.venv/bin/python -m unittest discover -s ml/tests -v
	cd frontend && npm run lint && npm run typecheck && npm test && npm run build
	frontend/scripts/smoke-demo.sh

frontend-check: check-node
	cd frontend && npm run lint && npm run typecheck && npm test

prepare:
	.venv/bin/wine-cv prepare-strict --data-root .

validate-data: prepare
	.venv/bin/wine-cv validate-field \
		--manifest data/field_mapping.tsv --data-root . \
		--report work/field-validation.json
	.venv/bin/wine-cv validate-eval-package \
		--manifest eval/queries.tsv --images-dir eval/queries \
		--report work/eval-fixture-receipt.json

smoke-demo: check-node
	cd frontend && npm run build
	frontend/scripts/smoke-demo.sh

acceptance-preflight:
	.venv/bin/wine-cv validate-eval-package \
		--manifest "$${TEST_MANIFEST:-eval/test/queries.tsv}" \
		--images-dir "$${TEST_IMAGES_DIR:-eval/test/images}" \
		--report work/acceptance-preflight.json

acceptance-run:
	eval/run_acceptance.sh

release-check: test check-secrets
	git diff --check -- . ':(exclude)data/*.tsv'

check-secrets:
	@if rg -n --hidden --glob '!.git/**' --glob '!work/**' 'rpa_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,}' .; then \
		echo 'Potential secret found' >&2; exit 1; \
	fi
	@echo 'No known token patterns found'
