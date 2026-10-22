# Сайт: требования и готовые данные

Сайт сделан в `web/` (React + Vite, деплой на GitHub Pages; см. `web/README.md`). Здесь — требования к сайту и описание данных, которые отдаёт сборка.

## Требования

- **Структура:** главная → курс → лекция.
- **Страница курса:** таблица «№ · дата · тема · PDF». Статусов нет: откуда конспект и написан ли он заранее, читателю не показывается (решение владельца, октябрь 2026).
- **Страница лекции:** шапка (хлебные крошки «Алгебра / Лекция 4», дата, кнопка «PDF»), оглавление по разделам, текст, в конце — ссылки на предыдущую и следующую лекцию. Без строки «Основано на» и без фильтра замечаний.
- **Отдельно:** «Теория» (теория курса, `theory/<course>.md`) и глоссарий курса: сначала по лекциям, внутри лекции — по алфавиту.
- **Подготовка к КР** (`prep/<course>/krN.md` → `/<course>/krN/`): темы КР с теорией, методами и задачами; у задач свёрнуты и ответ, и решение. На странице курса — кнопка «Подготовка к КР-N», выделена цветом и с датой до следующего дня после КР включительно (поток часто пишет КР два дня подряд; `date` — первый день); на главной в карточке курса — плитка ближайшей КР.
- **Ссылки на определения и теоремы по номеру** кликабельны и ведут на якорь, в том числе в другой лекции. Желательно превью блока при наведении: данные для этого есть в `index.json`.
- **Поиск** (⌘K / Ctrl+K, «/»): номер блока («4.3») находит метку из `index.json`, слова — разделы и блоки из `search.json` (грузится при первом открытии поиска).
- **Офлайн:** service worker (`web/sw/`). Оболочка сайта и общие данные скачиваются сразу; конспекты, теория и глоссарии — только когда их открыли (или по кнопке «Скачать все» в футере), и хранятся, пока их содержимое не изменится. PDF не кэшируются. Новая версия сайта — плашка «Мы кое-что поменяли… Обновить» сверху.
- Сайт должен быть красивым. Окружения выглядят так же, как в PDF; формулы — KaTeX.
- **Публикация:** GitHub Pages, `.github/workflows/pages.yml` после успешной сборки `main` (превью-деплоя на PR нет; html-версию PR можно смотреть в артефакте `site-data`).

## Что отдаёт сборка (`uv run scripts/build.py` → `build/site-data/`)

| Файл | Содержимое |
| --- | --- |
| `courses.json` | конфиг курсов (`templates/courses.json`) + список лекций каждого курса: номер, `week_id`, тема, дата, путь к исходнику; `preps` — страницы подготовки к КР по курсам: `id` (`kr1`), `title`, `date` (день КР) |
| `index.json` | все метки по курсам: `course → id → {type, name, number, title, tag, lecture, week_id}`. Это источник для превью ссылок и для поиска |
| `katex-macros.json` | общие макросы для KaTeX (из `templates/macros.tex`) |
| `search.json` | плоский текст всех конспектов и теорий для поиска: по записи на раздел (`<section id>`) или блок (`div.nb[id]`) — `course`, `doc` (`week_id` или `theory`), `lecture`, `anchor`, `heading`, `text`; inline-формулы как `$…$`; display-формулы, ответы к задачам и копии блоков в теории (`reg-…`) выброшены |
| `<course>/glossary.json` | склеенный глоссарий курса (по лекциям, внутри — по алфавиту): `term`, `term_html`, `def_html`, `lecture`, `week_id` |
| `<course>/<week_id>/fragment.html` | тело конспекта (без шапки), см. разметку ниже |
| `<course>/<week_id>/meta.json` | метаданные: заголовок, дата, `date_ru`, `header_line`, `toc` (уровень, id, текст), метки, глоссарий, рисунки |
| `<course>/<week_id>/fig/<sha1>.svg` | рисунки TikZ, скомпилированные в SVG (текст переведён в кривые, шрифты не нужны) |
| `<course>/<week_id>/index.html` | предпросмотр для ревью (`templates/preview.html`) — **не** сайт, но хорошая отправная точка для стилей |
| `<course>/theory/…` | то же для теории курса |

PDF лежат в `build/pdf/<course>/<week_id>.pdf`. В CI они загружаются как artifact `pdf` и в релиз `latest` под именами `<course>-<week_id>.pdf`.

## Разметка HTML-фрагмента

```html
<div id="thm:lec04:laplace" class="nb nb-theorem nb-style-theorem" data-type="theorem" data-number="4.3">
  <div class="nb-head"><span class="nb-name">Теорема 4.3 (разложение Лапласа)</span></div>
  <div class="nb-body">…</div>
</div>
<div class="nb nb-remark nb-style-remark nb-tag-pitfall" data-tag="pitfall" data-number="4.4">…</div>
<div class="nb-proof"><p><em>Доказательство.</em> …</p></div>
<div class="nb-answer"><p><strong>Ответ:</strong> …</p></div>
<details class="nb-answers"><summary>Ответы</summary>…</details>
<figure class="nb-figure" id="fig:lec04:x" data-number="4.5"><img src="fig/<sha1>.svg"><figcaption>…</figcaption></figure>
<span id="eq:lec04:x" class="nb-eq" data-number="4.6"><span class="math display">\[ … \tag{4.6} \]</span></span>
<a href="#thm:lec04:laplace" class="ref" data-ref="thm:lec04:laplace">4.3</a>
<a href="../02_sep09_gauss/#thm:lec02:gauss" class="ref" data-ref="thm:lec02:gauss">2.7 (лекция 2)</a>
```

- Стили блоков: `nb-style-{definition,theorem,example,remark,problem}`.
- Пометки замечаний: `data-tag` = `corner-case` | `pitfall` | `misconception` | `convention` | `reminder`.
- Формулы: `<span class="math inline|display">` с TeX внутри. Их нужно отрендерить KaTeX с `katex-macros.json`, на клиенте или при сборке.
- Ссылки между лекциями относительные (`../<week_id>/#id`). Они рассчитаны на URL вида `/<course>/<week_id>/`, теория курса — `/<course>/theory/`.
- Заголовки разделов получают id от pandoc; `--section-divs` оборачивает разделы в `<section>`.
