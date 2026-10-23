# web — сайт конспектов

React 19 + Vite + TypeScript, Tailwind v4, React Router, TanStack Query, KaTeX. Менеджер пакетов и рантайм скриптов — только Bun (`.bun-version`).
Сайт читает данные из `build/site-data` (см. `context/site.md`).

```bash
cd web
bun install
bun data:pull        # site-data и PDF из последнего успешного «Build notes» на main → public/ (нужен gh)
bun dev              # http://localhost:5173
bun run lint         # format → eslint → tsc → knip → jscpd → dependency-cruiser; единственная точка входа, чинит сам
bun run test         # vitest + testing-library (не `bun test`: это встроенный раннер Bun)
bun run build        # dist/ (+ 404.html и копии оболочки по страницам для GitHub Pages, sw.js и offline-manifest.json)
```

## Устройство

```
src/domain    чистая логика и zod-схемы данных сборки (без React, fetch, DOM)
src/api       загрузка JSON/HTML, запросы TanStack Query
src/shared    UI-кит, ридер конспекта (HTML-фрагмент → React: блоки, ссылки с превью, KaTeX, спойлеры)
src/features  страницы: home, course, lecture, theory, prep (подготовка к КР, `/<course>/kr1`; в шапке — PDF читлиста, если он есть), glossary (друг друга не импортируют)
src/app       роутер, оболочка (скелетоны при переходах)
sw/           service worker: отдельный бандл, из src берёт только domain/offline.ts
```

Границы слоёв проверяет dependency-cruiser. Правила линтера — `eslint.config.ts` (строгий набор из iamnalinor/pace-dev: typed strict, sonarjs, unicorn, perfectionist, лимиты размера функций, kebab-case файлов, без default export и `index.ts`); отключённое отключено с причиной.

Фрагмент конспекта разбирает `html-react-parser`: `div.nb` → `Block`, `a.ref` → `RefLink` (якорь по номеру + превью блока при наведении, по тапу на телефоне), `span.math` → KaTeX, `nb-proof` → сворачиваемое доказательство, `nb-answer`/`nb-solution` → спойлеры внутри карточки задачи.

Поиск (`src/shared/search/`, логика — `src/domain/search.ts`): модальный `<dialog>` по ⌘K / Ctrl+K или «/». Номер («4.3») ищется точно по `index.json`, слова — по `data/search.json` (весь текст без ответов к задачам и без копий блоков в теории, ~1,6 МБ; грузится при первом открытии, дальше из кэша service worker; «Скачать все» его не сохраняет): совпадение с началом слова (TeX формул не ищется), у слов длиннее 4 букв отбрасываются 2 последние буквы («миноры» → «мино»), слово в заголовке весит больше, чем в тексте. Код диалога — отдельный чанк, подгружается через 2 с после открытия страницы. Горячие клавиши проверяются по `event.code`: работают и в русской раскладке.

Google Analytics (GA4) вставляет плагин в `vite.config.ts` только в `vite build`: в `bun dev` и тестах счётчика нет. Переходы внутри SPA GA4 считает сам («Enhanced measurement → page changes based on browser history events»).

Шрифт — HSE Sans (`src/styles/fonts/`, 400/600/700/900; курсива у шрифта нет, браузер наклоняет сам), формулы — KaTeX.

## Офлайн

`scripts/build-sw.ts` после `vite build` считает хэш каждого файла в `dist/` и пишет `offline-manifest.json`: оболочка (`index.html`, JS, CSS, woff2) и общие данные (`courses.json`, `index.json`, `katex-macros.json`) — `precache`, каждая лекция, теория и глоссарий курса — документ из нескольких файлов. В `sw.js` вшита только версия манифеста, поэтому проверка обновлений раз в минуту стоит ~3 КБ.

- install: скачивает изменившиеся файлы оболочки в промежуточный кэш, старая версия пока продолжает работать;
- activate: удаляет из кэша файлы, чей хэш не совпал с новым манифестом (конспект перезагрузится, только если правда поменялся), переносит новые;
- fetch: навигация → `index.html` из кэша; известные файлы — из кэша, иначе из сети с сохранением; открытая лекция сохраняется целиком, вместе с рисунками ниже по странице; PDF — только сеть.

Футер показывает «Офлайн: N из M конспектов» (считаются только копии с актуальным хэшем) и кнопку «Скачать все». Новая версия — плашка сверху (`src/shared/offline/`). В `bun dev` воркер не регистрируется; проверять — `bun run build` и раздать `dist/` статикой.

## Деплой

`.github/workflows/pages.yml`: после успешного «Build notes» на `main` берёт его артефакты `site-data` и `pdf`, собирает сайт с `BASE_PATH=/<repo>/` и публикует на GitHub Pages. Проверки фронта — `.github/workflows/web.yml`.

### Прямые ссылки на Pages

У Pages нет SPA-фолбэка: неизвестный путь отдаёт `404.html` со статусом 404. Поэтому `scripts/spa-fallback.ts` после сборки:

- копирует оболочку (`index.html`) в `404.html`: любой путь запускает роутер;
- кладёт копию оболочки в `dist/<course>/`, `<course>/theory/`, `<course>/glossary/`, `<course>/krN/` и `<course>/<week_id>/index.html` (только для существующих документов) с заголовком, description и og-тегами этой страницы. Такая ссылка отдаётся со статусом 200 и со своим `<title>`, превью ссылок и поисковики видят настоящую страницу.

Оговорка: копии лежат как `каталог/index.html`, поэтому адрес без слэша (`/algebra/theory`) Pages сначала редиректит на `/algebra/theory/` (301), потом отдаёт страницу. Вариант `<route>.html` без редиректа не проверялся: неясно, как Pages ведёт себя, когда рядом лежат `algebra.html` и каталог `algebra/`, поэтому оставлен каталог. Ссылки внутри сайта идут через роутер и перезагрузки не вызывают.

Копии оболочки не входят в `offline-manifest.json` и service worker их не кэширует: любая навигация в его области отдаётся из закэшированного `index.html`. Смоук-тест `pages.yml` проверяет, что `/algebra/theory/` отдаёт копию с `<title>Алгебра: теория`, а не `404.html`.
