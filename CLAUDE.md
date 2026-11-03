# hse-notes

Конспекты лекций ПИ ФКН ВШЭ 2026/27 (алгебра, матанализ, дискретная математика, алгоритмы и алгоритмические языки): Pandoc Markdown → PDF (xelatex) и HTML-данные для сайта.

**Перед любой работой с конспектами прочитай `context/README.md`.** Там сказано, что читать для твоей задачи. Правила — в `context/`, конспекты — `notes/<course>/<week_id>.md`, теория курса — `theory/<course>.md`, подготовка к КР и коллоквиуму — `prep/<course>/krN.md`, `colloqN.md` (банк билетов — `colloqN-bank.yaml`), план учебной дисциплины (ПУД) — `program/<course>.md`.

```bash
./scripts/setup.sh && export PATH="$HOME/.TinyTeX/bin/x86_64-linux:$PATH"
uv run scripts/lint.py          # схема конспектов
uv run scripts/build.py         # PDF и site-data в build/
uv run pytest -q                # тесты фильтра, сборки, линтера
```

## Окружение в новой сессии

Контейнер свежий: TeX, Python-зависимости и `node_modules` не поставлены. Перед работой:

1. `./scripts/setup.sh` (идемпотентен, первый раз ~5 минут: качает TinyTeX и пакеты TeX Live, делает `uv sync --locked`). Без него `build.py` и часть `pytest` падают с `FileNotFoundError: 'xelatex'`. PATH не сохраняется между командами: в каждой, где нужен TeX, — `export PATH="$HOME/.TinyTeX/bin/x86_64-linux:$PATH"`.
2. `cd web && bun install` — иначе `bun run lint`/`test` падают с `biome: command not found`. Он же ставит git-хуки lefthook: pre-commit гоняет `bun run lint`, pre-push — `bun run test` (только при правках в `web/`).
3. Сайт с настоящими данными: `uv run scripts/build.py`, затем `rm -rf web/public/data && cp -r build/site-data web/public/data && find web/public/data -name index.html -delete` (как в `pages.yml`; `web/public/data` в `.gitignore`), `bun run build` и `bunx vite preview` из `web/`. Без данных `bun run build` собирает только оболочку и `404.html`.
4. Playwright с Chromium уже стоит в контейнере (`require('playwright')`) — для проверок в браузере ставить его заново не нужно. `bun og:images` требует Chromium той версии Playwright, что в `web/package.json` (см. `web/scripts/og-images.ts`).

Код пайплайна: `filters/notes.lua` (нумерация, блоки, ссылки), `templates/` (LaTeX-стиль, шаблоны, макросы), `scripts/` (сборка, линт). CI — `.github/workflows/build.yml`. `build/`, `.cache/`, `sources/` не коммитятся.

## Сайт (`web/`)

Фронтенд — React + Vite + Bun. Читай `web/README.md`. После любой правки в `web/` запускай `bun run lint` (из `web/`): это единственная точка входа, она сама чинит формат и сортировку. Правила линтера не ослаблять — чинить код; отключать правило можно только с причиной. Тесты — `bun run test`. Деплой — `.github/workflows/pages.yml` на каждый push в `main` (после «Build notes»); статус смотреть через `gh run list --workflow Pages`.

## Git

PR в `main` вливать только squash-мержем. Сообщения коммитов (и заголовки PR) — всегда на английском.
