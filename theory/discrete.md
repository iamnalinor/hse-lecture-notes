---
course: discrete
title: "Теория: дискретная математика"
---

# Соглашения курса

Здесь только то, что в курсе принято иначе, чем в других книгах и курсах, или обозначается по-своему. Ловушки и корнер-кейсы — в замечаниях лекций.

- $0 \in \N$: $\N = \{0, 1, 2, \dots\}$, положительные натуральные — $\N_+$ (замечание [-@rem:lec01:nat]); поэтому база индукции — $\varphi(0)$ (замечание [-@rem:lec03:nat]). В матанализе соглашение обратное.
- Скобки в $A \to B \to C$ и $A \wedge B \vee C$ не опускаются: правил приоритета для них нет (замечание [-@rem:lec01:no-priority]).
- Предметная область квантора всегда непуста (замечание [-@rem:lec02:nonempty]).
- С лекции 4 «число» — целое (замечание [-@rem:lec04:integers]).
- Сравнения по модулю $m$ рассматриваются только при $m > 1$ (замечание [-@rem:lec04:modulus]).
- $\deg(p, n)$ — показатель простого $p$ в разложении $n$; для $n = 0$ не определён (определение [-@def:lec05:deg]).
- НОД и НОК — натуральные числа, определённые через делимость: $\gcd(0, 0) = 0$, $\operatorname{lcm}(0, a) = 0$; в формулах $\gcd$, $\operatorname{lcm}$, в тексте НОД, НОК (замечание [-@rem:lec06:gcd-natural]).
- $\varphi(m)$ считает взаимно простые с $m$ числа среди $0, 1, \dots, m - 1$; $a^{-1}$ и $a^{-k} = (a^{-1})^k$ по модулю $m$ — числа из $\{0, \dots, m - 1\}$ и их степени, а не дроби (определения [-@def:lec07:inverse], [-@def:lec07:neg-power]).
- Решение сравнения $ax \equiv c \pmod m$ — число из $\{0, \dots, m - 1\}$, решение системы — кортеж чисел из $\{0, \dots, \mu - 1\}$, $\mu$ — НОК модулей; поэтому «число решений» всегда считается по модулю (НОК) исходных модулей (замечание [-@rem:lec08:solution-convention], определение [-@def:lec08:system]).
- Композиция отношений читается справа налево: в $Q \circ P$ первым действует $P$, как в $g(f(x))$; в курсе алгебры подстановки, наоборот, умножаются слева направо (замечание [-@rem:lec12:order]).
- Функция $f\colon A \to B$ отождествляется со своим графиком $f \subseteq A \times B$; множество $B$ ею не определяется, поэтому сюръективность всегда понимается «для $B$» (замечание [-@rem:lec13:codomain]). Для отношения $R \subseteq A \times B$ «тотально» по умолчанию значит «тотально для $A$», «сюръективно» — «сюръективно для $B$» (определение [-@def:lec13:total-surjective]).
- Жирное $\mathbf{n}$ — множество $\{0, 1, \dots, n - 1\}$, обычное $n$ — число; $\mathbf{2}^X$ — функции из $X$ в $\{0, 1\}$, $X^2$ — декартов квадрат (замечание [-@rem:lec15:bold]). Мощность $|A|$ определена только для конечных множеств; бесконечные сравниваются через $\sim$ и $\lesssim$ (замечание [-@rem:lec16:abs]).
- Пересечение $\bigcap A$ определено только для непустого семейства $A$; $\bigcap \varnothing$ не определено (замечание [-@rem:lec10:indexed]).
- Биномиальный коэффициент — $C_n^k$ ($n$ внизу), не $\binom{n}{k}$ (замечание [-@rem:lec17:binom-notation]); $C_n^k = 0$ при $k > n$, поэтому тождество Паскаля верно при всех $n, k \in \N$ (замечание [-@rem:lec17:pascal-edge]).
- Порядок по умолчанию строгий; в парах $(<, \le)$, $(\subsetneq, \subseteq)$ первый символ — строгий порядок (замечание [-@rem:lec19:pair-notation]).
- Длина цепи (антицепи) — число её элементов, а не число «шагов» (замечание [-@rem:lec20:length]).
- Графы конечны и непусты: хотя бы одна вершина (замечание [-@rem:lec21:finite]); длина пути в графе — число рёбер.

# Лекция 1 — Истинность, ложность и высказывания

::: {.definition ref="def:lec01:statement"}
Высказывание — модель повествовательного предложения, которая либо истинна, либо ложна, но не то и другое одновременно.
:::

::: {.definition ref="def:lec01:truth-value"}
$[A] = 1$, если $A$ истинно, и $[A] = 0$, если ложно.
:::

::: {.definition ref="def:lec01:connective"}
Связка $F$: $[F(A_1, \dots, A_n)] = f([A_1], \dots, [A_n])$ для некоторой функции $f$ — значение целого зависит только от значений частей.
:::

::: {.definition ref="def:lec01:atom"}
Атом — высказывание, которое нельзя разумно разбить на более простые связками.
:::

::: {.definition ref="def:lec01:connectives"}
$\neg A$, $A \wedge B$, $A \vee B$, $A \to B$, $A \leftrightarrow B$ заданы таблицей истинности; $A \to B$ ложна только при $[A] = 1$, $[B] = 0$, $A \leftrightarrow B$ истинна при $[A] = [B]$.
:::

::: {.proposition ref="prop:lec01:arith" status="доказано в лекции 1"}
$[A \wedge B] = \min = [A][B]$, $[A \vee B] = \max$, $[\neg A] = 1 - [A]$, $[A \to B] = 1 \iff [A] \le [B]$, $[A \leftrightarrow B] = 1 \iff [A] = [B]$. *Идея:* проверка по четырём строкам таблицы.
:::

::: {.definition ref="def:lec01:formula"}
Формула $F(A_1, \dots, A_n)$ — одно из $A_i$ или составное высказывание, построенное из них связками; не каждый $A_i$ обязан входить. Приоритет: $\neg$, затем $\wedge, \vee$, затем $\to$; $X \wedge Y \wedge Z = (X \wedge Y) \wedge Z$.
:::

::: {.definition ref="def:lec01:equivalence"}
$F \equiv G$, если $[F] = [G]$ при всех значениях атомов.
:::

::: {.proposition ref="prop:lec01:laws" status="доказано в лекции 1"}
Коммутативность и ассоциативность $\wedge$, $\vee$; $\neg\neg A \equiv A$; $A \to B \equiv \neg A \vee B$; $\neg(A \to B) \equiv A \wedge \neg B$; контрапозиция $A \to B \equiv \neg B \to \neg A$; законы де Моргана; $A \leftrightarrow B \equiv (A \to B) \wedge (B \to A)$. *Идея:* сравнить случаи ложности (истинности) обеих частей.
:::

::: {.definition ref="def:lec01:tautology"}
Тавтология — формула, истинная при всех значениях атомов.
:::

::: {.definition ref="def:lec01:satisfiable"}
Выполнимая формула — истинная хотя бы при одном наборе значений атомов.
:::

::: {.proposition ref="prop:lec01:taut-sat" status="доказано в лекции 1"}
$F$ выполнима $\iff$ $\neg F$ не тавтология; $F$ — тавтология $\iff$ $\neg F$ невыполнима $\iff$ $F \equiv T$ для тавтологии $T$; $F \equiv G \iff F \leftrightarrow G$ — тавтология. *Идея:* отрицание меняет «при всех наборах» на «при некотором наборе».
:::

::: {.definition ref="def:lec01:valid"}
Рассуждение «$A_1, \dots, A_n$; следовательно, $C$» корректно, если не бывает истинных посылок при ложном выводе.
:::

::: {.proposition ref="prop:lec01:valid-taut" status="доказано в лекции 1"}
Если $(A_1 \wedge \ldots \wedge A_n) \to C$ — тавтология, рассуждение корректно; обратное неверно (опровергающий набор значений может не реализовываться ни в какой ситуации). *Идея:* при истинных посылках истинная импликация даёт истинный вывод.
:::

# Лекция 2 — Язык математики. Предикаты и кванторы

::: {.definition ref="def:lec02:predicate"}
$n$-местный предикат — выражение с переменными $x_1, \dots, x_n$, которое становится высказыванием после подстановки подходящих объектов вместо всех переменных; высказывание — нульместный предикат.
:::

::: {.definition ref="def:lec02:domain"}
Предметная область переменной — совокупность объектов, которые разрешено подставлять вместо неё.
:::

::: {.definition ref="def:lec02:quantifiers"}
$\exists x\, A(x)$ истинно, если $A(a)$ истинно хотя бы для одного объекта $a$ области; $\forall x\, A(x)$ — если для каждого.
:::

::: {.definition ref="def:lec02:bound"}
Область действия квантора — часть формулы, к которой он применён. Вхождение переменной связано, если оно в области действия квантора по ней, иначе свободно; формула без свободных переменных — высказывание. Квантор связывает сильнее бинарных связок.
:::

::: {.proposition ref="prop:lec02:quant-neg" status="доказано в лекции 2 (по смыслу кванторов)"}
$\exists x\, A \equiv \neg\forall x\, \neg A$, $\forall x\, A \equiv \neg\exists x\, \neg A$; $\neg\forall x\, A \equiv \exists x\, \neg A$, $\neg\exists x\, A \equiv \forall x\, \neg A$. *Идея:* на конечной области это законы де Моргана для «длинных» $\wedge$ и $\vee$.
:::

::: {.definition ref="def:lec02:unique"}
«Существует единственный»: $\exists x\, (A(x) \wedge \forall y\, (A(y) \to y = x))$, сокращение $\exists ! x\, A(x)$.
:::

::: {.proposition ref="prop:lec02:order" status="доказано в лекции 2"}
$\exists y\, \forall x\, A(x, y)$ влечёт $\forall x\, \exists y\, A(x, y)$; обратное неверно. *Идея:* один свидетель $y_0$ годится для всех $x$; контрпример к обратному — $\forall x\, \exists y\, (y > x)$ в $\N$.
:::

::: {.definition ref="def:lec02:vacuous"}
Пустая истина — $\forall x\, (A(x) \to B(x))$, истинное потому, что $A(x)$ ложно для всех $x$.
:::

# Лекция 3 — Индукция на натуральных числах

::: {.axiom ref="ax:lec03:induction"}
ПМИ: $\varphi(0) \wedge \forall n \in \N\, (\varphi(n) \to \varphi(n + 1)) \to \forall n \in \N\ \varphi(n)$; для множеств: если $X \subseteq \N$, $0 \in X$ и $n \in X \Rightarrow n + 1 \in X$ при всех $n$, то $X = \N$.
:::

::: {.proposition ref="prop:lec03:shifted" status="доказано в лекции 3"}
Если $\varphi(n_0)$ и $\varphi(n) \to \varphi(n + 1)$ при всех $n \ge n_0$, то $\varphi(n)$ при всех $n \ge n_0$. *Идея:* ПМИ для $\psi(n) := (n \ge n_0 \to \varphi(n))$; при $n < n_0$ — пустая истина.
:::

::: {.definition ref="def:lec03:progressive"}
$X \subseteq \N$ прогрессивно, $\mathrm{Prog}(X)$, если $\forall n\, \bigl(\forall m < n\ (m \in X) \to n \in X\bigr)$.
:::

::: {.proposition ref="prop:lec03:strong" status="доказано в лекции 3 (теорема о равносильности)"}
ПСИ: всякое прогрессивное $X \subseteq \N$ равно $\N$.
:::

::: {.lemma ref="lem:lec03:prog-zero" status="доказано в лекции 3"}
Если $\mathrm{Prog}(X)$, то $0 \in X$. *Идея:* при $n = 0$ посылка $\forall m < 0\ (m \in X)$ — пустая истина.
:::

::: {.proposition ref="prop:lec03:lnp" status="доказано в лекции 3 (теорема о равносильности)"}
ПНЧ: всякое непустое $X \subseteq \N$ имеет наименьший элемент $\min X$. Для $\Z$ и для $\{x \in \Q \mid x > 0\}$ неверно.
:::

::: {.theorem ref="thm:lec03:equiv" status="доказано в лекции 3"}
ПСИ, ПНЧ и ПМИ равносильны. *Идея:* ПСИ $\Rightarrow$ ПНЧ — если у $X$ нет минимума, то $\overline{X}$ прогрессивно; ПНЧ $\Rightarrow$ ПМИ — $n = \min \overline{X} = m + 1$ с $m \in X$; ПМИ $\Rightarrow$ ПСИ — индукция для $Y = \{n \mid \forall m < n\ (m \in X)\}$.
:::

# Лекция 4 — Делимость. Деление с остатком. Сравнения

::: {.definition ref="def:lec04:divides"}
$a \mid b \iff \exists k \in \Z\ b = ak$; делитель, кратное. $0 \mid 0$ верно. Если $a \mid b$ и $b \ne 0$, то $|a| \le |b|$, поэтому у ненулевого числа конечно много делителей.
:::

::: {.lemma ref="lem:lec04:basic" status="доказано в лекции 4"}
$a \mid 0$; $1 \mid a$; $0 \mid a \Rightarrow a = 0$; $a \mid 1 \Rightarrow a = \pm 1$. *Идея:* последнее — из $1 = |a| \cdot |k| \ge |a| \ge 1$.
:::

::: {.lemma ref="lem:lec04:order" status="доказано в лекции 4"}
$a \mid a$; $a \mid b \wedge b \mid c \Rightarrow a \mid c$; $a \mid b \wedge b \mid a \Rightarrow a = \pm b$. *Идея:* в третьем $a = a k_1 k_2$, случаи $a = 0$ и $k_1 k_2 = 1$.
:::

::: {.lemma ref="lem:lec04:sum" status="доказано в лекции 4"}
$a \mid b \wedge a \mid c \Rightarrow a \mid b \pm c$.
:::

::: {.corollary ref="cor:lec04:sum" status="доказано в лекции 4"}
Если $a \mid b$ и $a \mid b + c$ (или $a \mid b - c$), то $a \mid c$.
:::

::: {.theorem ref="thm:lec04:division-nat" status="доказано в лекции 4"}
Для $a, b \in \N$, $b \ne 0$, существует единственная пара $(q, r) \in \N^2$ с $a = bq + r$, $0 \le r < b$. *Идея:* $q + 1 = \min\{s \in \N \mid a < bs\}$ по ПНЧ; единственность — из $r - r' = b(q' - q) \ge b$.
:::

::: {.definition ref="def:lec04:quotient"}
$q$ — неполное частное, $r$ — остаток от деления $a$ на $b$. Если $x > 0$ даёт остаток $r > 0$ при делении на $m$, то остаток $-x$ равен $m - r$ (при $r = 0$ — тоже $0$): остаток отрицательного числа — не его последняя цифра.
:::

::: {.corollary ref="cor:lec04:division" status="доказано в лекции 4"}
Теорема о делении с остатком: для $a$ и $b \ne 0$ существует единственная пара $(q, r) \in \Z \times \N$ с $a = bq + r$, $0 \le r < |b|$. *Идея:* делим $|a|$ на $|b|$; при $a < 0$, $r' > 0$ берём $-q' - 1$ и $|b| - r'$.
:::

::: {.definition ref="def:lec04:congruence"}
При $m > 1$: $a \equiv b \pmod m \iff m \mid a - b$. Если $a \equiv b \pmod m$, $n \mid m$ и $n > 1$, то $a \equiv b \pmod n$.
:::

::: {.lemma ref="lem:lec04:same-rem" status="доказано в лекции 4"}
$a \equiv b \pmod m$ тогда и только тогда, когда остатки от деления $a$ и $b$ на $m$ равны. *Идея:* $m \mid r - r'$ и $|r - r'| < m$.
:::

::: {.corollary ref="cor:lec04:distinct" status="доказано в лекции 4"}
Числа $0, 1, \dots, m - 1$ попарно несравнимы по модулю $m$.
:::

::: {.corollary ref="cor:lec04:to-rem" status="доказано в лекции 4"}
$a \equiv r \pmod m$, где $r$ — остаток от деления $a$ на $m$.
:::

::: {.corollary ref="cor:lec04:equivalence" status="доказано в лекции 4"}
Сравнимость по модулю $m$ рефлексивна, симметрична и транзитивна.
:::

::: {.lemma ref="lem:lec04:arith" status="доказано в лекции 4"}
Если $a \equiv b$ и $c \equiv d \pmod m$, то $a \pm c \equiv b \pm d$, $ac \equiv bd$, $a^n \equiv b^n \pmod m$ ($n \in \N$). *Идея:* $ac - bd = m(bk_2 + dk_1 + mk_1k_2)$; степень — индукцией.
:::

# Лекция 5 — Вычисления по модулю. Простые числа. Основная теорема арифметики

::: {.definition ref="def:lec05:prime"}
Простое: $p > 1$, делители только $\pm 1, \pm p$; составное: $n > 1$, не простое. Отрицательные числа, $0$ и $1$ — ни то ни другое.
:::

::: {.lemma ref="lem:lec05:composite" status="доказано в лекции 5"}
$n > 1$ составное тогда и только тогда, когда $n = km$ с $1 < k, m < n$.
:::

::: {.definition ref="def:lec05:factorization"}
Разложение $n \ge 1$: $n = p_1^{a_1} \cdots p_s^{a_s}$, $p_i$ — попарно различные простые, $a_i \in \N$; степень простого $p$ в разложении ($0$, если $p$ нет в списке); разложения существенно одинаковы, если степени всех простых совпадают.
:::

::: {.theorem ref="thm:lec05:fta" status="доказано в лекции 5"}
ОТА: каждое $n \ge 1$ имеет разложение на простые, и любые два его разложения существенно одинаковы. *Идея:* обе части доказываются минимальным контрпримером. Единственность: у наименьшего «плохого» $n$ общих простых в двух разложениях нет; для $p > q$ из разных разложений число $m = (p - q) \cdot \frac{n}{p} < n$ имеет разложения с разной степенью $q$, если $q \nmid p - q$, а $q \mid p - q$ даёт $q \mid p$.
:::

::: {.definition ref="def:lec05:deg"}
$\deg(p, n)$ для $n \ne 0$ — степень простого $p$ в любом разложении $\pm p_1^{a_1} \cdots p_s^{a_s}$ числа $n$; $\deg(p, ab) = \deg(p, a) + \deg(p, b)$.
:::

::: {.theorem ref="thm:lec05:infinite" status="доказано в лекции 5"}
Простых чисел бесконечно много. *Идея:* простой делитель числа $p_1 \cdots p_n + 1$ не может быть ни одним из $p_i$.
:::

::: {.lemma ref="lem:lec05:criterion" status="доказано в лекции 5"}
Признак делимости: для $a, b \ne 0$ $a \mid b$ тогда и только тогда, когда $\deg(p, a) \le \deg(p, b)$ для всех простых $p$. *Идея:* $\deg(p, ak) = \deg(p, a) + \deg(p, k)$; обратно $b = a \cdot (\pm \prod p_i^{\beta_i - \alpha_i})$.
:::

# Лекция 6 — НОД и НОК. Взаимно простые числа. Тождество Безу

::: {.definition ref="def:lec06:gcd"}
$d = \gcd(a, b)$ (НОД), если $d \in \N$, $d \mid a$, $d \mid b$ и каждый общий делитель $a$ и $b$ делит $d$.
:::

::: {.lemma ref="lem:lec06:gcd-exists" status="доказано в лекции 6"}
НОД существует и единствен; $\gcd(0, b) = |b|$; для ненулевых $a = \pm \prod p_i^{\alpha_i}$, $b = \pm \prod p_i^{\beta_i}$: $\gcd(a, b) = \prod p_i^{\min(\alpha_i, \beta_i)}$. *Идея:* единственность — два НОД делят друг друга; существование — признак делимости.
:::

::: {.definition ref="def:lec06:lcm"}
$m = \operatorname{lcm}(a, b)$ (НОК), если $m \in \N$, $a \mid m$, $b \mid m$ и $m$ делит каждое общее кратное $a$ и $b$. Значит, из $a \mid c$ и $b \mid c$ следует $\operatorname{lcm}(a, b) \mid c$, но не $ab \mid c$ (это верно лишь при $\gcd(a, b) = 1$: $4 \mid 12$, $6 \mid 12$, $24 \nmid 12$).
:::

::: {.lemma ref="lem:lec06:lcm-exists" status="доказано в лекции 6"}
НОК существует и единственно; $\operatorname{lcm}(0, a) = 0$; для ненулевых $a, b$: $\operatorname{lcm}(a, b) = \prod p_i^{\max(\alpha_i, \beta_i)}$.
:::

::: {.proposition ref="prop:lec06:gcd-lcm-props" status="доказано в лекции 6"}
НОД и НОК симметричны и ассоциативны. Кроме того, $\gcd(a, a) = \operatorname{lcm}(a, a) = |a|$, а также $\gcd(a, \operatorname{lcm}(a, b)) = |a|$ и $\operatorname{lcm}(a, \gcd(a, b)) = |a|$. Главное: $\gcd(a, b) \cdot \operatorname{lcm}(a, b) = |ab|$. *Идея:* последнее — $\min + \max = \alpha + \beta$.
:::

::: {.lemma ref="lem:lec06:gcd-shift" status="доказано в лекции 6"}
$\gcd(a, b) = \gcd(a + bq, b)$ для любых $a, b, q$. *Идея:* у двух пар одни и те же общие делители.
:::

::: {.corollary ref="cor:lec06:gcd-rem" status="доказано в лекции 6"}
Если $r$ — остаток от деления $a$ на $b$, то $\gcd(r, b) = \gcd(a, b)$.
:::

::: {.definition ref="def:lec06:coprime"}
$a$ и $b$ взаимно просты, если $\gcd(a, b) = 1$.
:::

::: {.lemma ref="lem:lec06:coprime-equiv" status="доказано в лекции 6"}
Равносильны: $\gcd(a, b) = 1$; каждый общий делитель равен $\pm 1$; нет общего простого делителя; (при $a, b \ne 0$) $\min(\deg(p, a), \deg(p, b)) = 0$ для всех простых $p$.
:::

::: {.corollary ref="cor:lec06:divide-gcd" status="доказано в лекции 6"}
Если $(a, b) \ne (0, 0)$, то $\frac{a}{\gcd(a, b)}$ и $\frac{b}{\gcd(a, b)}$ — целые взаимно простые.
:::

::: {.lemma ref="lem:lec06:coprime-divides" status="доказано в лекции 6"}
Если $a \mid bc$ и $\gcd(a, b) = 1$, то $a \mid c$. *Идея:* $\alpha_i \le \beta_i + \gamma_i$ и $\min(\alpha_i, \beta_i) = 0$ дают $\alpha_i \le \gamma_i$; другое доказательство — умножить $au + bv = 1$ на $c$.
:::

::: {.corollary ref="cor:lec06:cancel" status="доказано в лекции 6"}
Если $ax \equiv ay \pmod m$ и $\gcd(a, m) = 1$, то $x \equiv y \pmod m$.
:::

::: {.theorem ref="thm:lec06:bezout" status="доказано в лекции 6"}
Тождество Безу: если $\gcd(a, b) = 1$, то $au + bv = 1$ для некоторых $u, v \in \Z$. *Идея:* по ПНЧ берём наименьшее $d > 0$ вида $as + bt$; остаток от деления $a$ (и $b$) на $d$ того же вида и меньше $d$, поэтому равен $0$; значит, $d$ — общий делитель, $d = 1$.
:::

::: {.corollary ref="cor:lec06:bezout-gcd" status="доказано в лекции 6"}
Для любых $a, b$ существуют $u, v$ с $au + bv = \gcd(a, b)$. *Идея:* Безу для $a / \gcd$ и $b / \gcd$, затем умножить на $\gcd$.
:::

# Лекция 7 — Обратный элемент по модулю. Теоремы Эйлера и Ферма

::: {.lemma ref="lem:lec07:inverse-exists" status="доказано в лекции 7"}
При $m > 1$ сравнение $ax \equiv 1 \pmod m$ разрешимо тогда и только тогда, когда $\gcd(a, m) = 1$. *Идея:* $ax + my = 1$ — Безу в одну сторону, общий делитель делит $1$ — в другую.
:::

::: {.corollary ref="cor:lec07:inverse-unique" status="доказано в лекции 7"}
При $m > 1$ и $\gcd(a, m) = 1$ существует единственное $x \in \{0, \dots, m - 1\}$ с $ax \equiv 1 \pmod m$; любое решение сравнимо с ним.
:::

::: {.definition ref="def:lec07:inverse"}
$a^{-1}$ — обратный к $a$ по модулю $m$: единственное $x \in \{0, \dots, m - 1\}$ с $ax \equiv 1 \pmod m$ (при $m > 1$ и $\gcd(a, m) = 1$); $(a^{-1})^{-1} \equiv a$.
:::

::: {.definition ref="def:lec07:totient"}
Функция Эйлера: $\varphi(m)$ при $m > 1$ — количество чисел из $\{0, 1, \dots, m - 1\}$, взаимно простых с $m$; $\varphi(p) = p - 1$, а для различных простых $p$, $q$: $\varphi(pq) = (p - 1)(q - 1)$, $\varphi(p^2) = p^2 - p$.
:::

::: {.theorem ref="thm:lec07:euler" status="доказано в лекции 7"}
Теорема Эйлера: если $m > 1$ и $\gcd(a, m) = 1$, то $a^{\varphi(m)} \equiv 1 \pmod m$. *Идея:* остатки чисел $aq_1, \dots, aq_s$ ($q_i$ — взаимно простые с $m$ остатки) попарно различны и взаимно просты с $m$, то есть совпадают с $q_1, \dots, q_s$; перемножить и сократить на $q_1 \cdots q_s$.
:::

::: {.corollary ref="cor:lec07:fermat" status="доказано в лекции 7"}
Малая теорема Ферма: если $p$ простое и $p \nmid a$, то $a^{p-1} \equiv 1 \pmod p$. Обращение неверно, но верен критерий простоты (без доказательства): $m > 1$ простое тогда и только тогда, когда для некоторого $a$ выполнено $a^{m-1} \equiv 1 \pmod m$ и $a^{(m-1)/q} \not\equiv 1 \pmod m$ для каждого простого $q \mid m - 1$.
:::

::: {.proposition ref="prop:lec07:fermat-alt" status="доказано в лекции 7"}
Если $p$ простое, то $a^p \equiv a \pmod p$ для любого $a$; равносильно МТФ.
:::

::: {.corollary ref="cor:lec07:exp-mod" status="доказано в лекции 7"}
Если $m > 1$, $\gcd(a, m) = 1$, $x, y \in \N$ и $\varphi(m) \mid x - y$, то $a^x \equiv a^y \pmod m$.
:::

::: {.definition ref="def:lec07:neg-power"}
При $m > 1$, $\gcd(a, m) = 1$ и $k \in \N$: $a^{-k} = (a^{-1})^k$ по модулю $m$; $a^{-k} \equiv (a^k)^{-1}$.
:::

::: {.lemma ref="lem:lec07:neg-power" status="доказано в лекции 7"}
При $m > 1$ и $\gcd(a, m) = 1$ для всех $x, y \in \Z$: $a^{x+y} \equiv a^x a^y$, $a^{xy} \equiv (a^x)^y \pmod m$. *Идея:* разбор знаков $x$ и $y$ через $(a^{-1})^k \equiv (a^k)^{-1}$.
:::

::: {.corollary ref="cor:lec07:exp-mod-int" status="доказано в лекции 7"}
Если $m > 1$, $\gcd(a, m) = 1$, $x, y \in \Z$ и $\varphi(m) \mid x - y$, то $a^x \equiv a^y \pmod m$.
:::

# Лекция 8 — Линейные уравнения и сравнения

::: {.definition ref="def:lec08:euclid"}
Алгоритм Евклида для $a$ и $b \ne 0$: $r_0 = a$, $r_1 = b$, $r_k = r_{k+1} q_{k+1} + r_{k+2}$ с $0 \le r_{k+2} < |r_{k+1}|$, пока очередной остаток не равен $0$; $r_s$ — последний ненулевой остаток.
:::

::: {.lemma ref="lem:lec08:euclid-stops" status="доказано в лекции 8"}
Алгоритм Евклида останавливается для любых $a$ и $b \ne 0$. *Идея:* остатки — строго убывающие натуральные числа; по ПНЧ среди них есть наименьший, и он может быть только нулём.
:::

::: {.lemma ref="lem:lec08:euclid-gcd" status="доказано в лекции 8"}
$\gcd(a, b) = |r_s|$ (при $s \ge 2$ просто $r_s$). *Идея:* $\gcd(r_k, r_{k+1}) = \gcd(r_{k+1}, r_{k+2})$ на каждом шаге, в конце $\gcd(r_s, 0) = |r_s|$.
:::

::: {.definition ref="def:lec08:extended"}
Расширенный алгоритм Евклида: $u_0 = 1$, $v_0 = 0$, $u_1 = 0$, $v_1 = 1$, $u_{k+2} = u_k - u_{k+1} q_{k+1}$, $v_{k+2} = v_k - v_{k+1} q_{k+1}$.
:::

::: {.proposition ref="prop:lec08:extended" status="доказано в лекции 8"}
$r_k = a u_k + b v_k$ для всех $k$; в частности, $\gcd(a, b) = \pm(a u_s + b v_s)$. *Идея:* сильная индукция по $k$ — коэффициенты пересчитываются той же формулой, что и остатки.
:::

::: {.theorem ref="thm:lec08:diophantine" status="доказано в лекции 8"}
При $a, b \ne 0$ уравнение $ax + by = c$ разрешимо в целых числах тогда и только тогда, когда $d = \gcd(a, b) \mid c$; тогда все решения — $(x_0 - b't, y_0 + a't)$, $t \in \Z$, где $a' = \frac{a}{d}$, $b' = \frac{b}{d}$, $(x_0, y_0)$ — любое решение. *Идея:* сократить на $d$; частное решение — Безу, умноженное на $\frac{c}{d}$; из $a'(x_0 - x) = b'(y - y_0)$ и $\gcd(a', b') = 1$ следует $b' \mid x_0 - x$.
:::

::: {.definition ref="def:lec08:congruence-solution"}
Решение сравнения $ax \equiv c \pmod m$ ($m > 1$) — число $x_0$ с $ax_0 \equiv c \pmod m$ и $0 \le x_0 < m$.
:::

::: {.theorem ref="thm:lec08:linear-congruence" status="доказано в лекции 8"}
При $a \ne 0$, $m > 1$, $d = \gcd(a, m)$ сравнение $ax \equiv c \pmod m$ разрешимо тогда и только тогда, когда $d \mid c$; тогда у него ровно $d$ решений $x_0, x_0 + m', \dots, x_0 + (d - 1)m'$, где $m' = \frac{m}{d}$, а $x_0$ — единственное число из $[0, m')$ с $m' \mid \frac{a}{d} x_0 - \frac{c}{d}$. *Идея:* сравнение — уравнение $ax - my = c$; после сокращения на $d$ решение по модулю $m'$ единственно (сокращение на $a'$, взаимно простое с $m'$), а в $[0, m)$ лежат $d$ сравнимых с ним чисел.
:::

::: {.proposition ref="prop:lec08:pouring" status="доказано в лекции 8"}
Сосудами на $a$ и $b$ литров ($a, b \in \N_+$) можно отмерить $c$ литров тогда и только тогда, когда $\gcd(a, b) \mid c$ и $0 \le c \le \max(a, b)$. *Идея:* все объёмы всегда имеют вид $ax + by$; при $a \le b$ переливание малого сосуда в большой даёт в большом остатки чисел $ka$ по модулю $b$, а $ak \equiv c \pmod b$ разрешимо при $\gcd(a, b) \mid c$.
:::

::: {.proposition ref="prop:lec08:brute-force" status="доказано в лекции 8"}
Значение многочлена с целыми коэффициентами по модулю $m$ зависит только от остатков аргументов; поэтому все решения полиномиального сравнения находятся перебором кортежей остатков $0, \dots, m - 1$.
:::

::: {.definition ref="def:lec08:lcm-many"}
$\mu = \operatorname{lcm}(c_1, \dots, c_n)$, если $\mu \in \N$, все $c_i \mid \mu$ и $\mu$ делит каждое общее кратное $c_1, \dots, c_n$.
:::

::: {.lemma ref="lem:lec08:lcm-many" status="доказано в лекции 8"}
НОК нескольких чисел существует и единственно; равен $0$, если некоторое $c_i = 0$, и $\prod_j p_j^{\max_i \gamma_{ij}}$ для ненулевых $c_i = \pm \prod_j p_j^{\gamma_{ij}}$.
:::

::: {.corollary ref="cor:lec08:mod-lcm" status="доказано в лекции 8"}
При $m_1, \dots, m_n > 1$: $x \equiv y \pmod{m_i}$ для всех $i$ тогда и только тогда, когда $x \equiv y \pmod{\operatorname{lcm}(m_1, \dots, m_n)}$.
:::

::: {.definition ref="def:lec08:system"}
Решение системы сравнений $P_i(x_1, \dots, x_k) \equiv 0 \pmod{m_i}$, $i = 1, \dots, n$, — кортеж, удовлетворяющий всем сравнениям, с $0 \le x_j < \mu = \operatorname{lcm}(m_1, \dots, m_n)$.
:::

::: {.lemma ref="lem:lec08:system-reduce" status="доказано в лекции 8"}
Целый кортеж удовлетворяет системе тогда и только тогда, когда он покомпонентно сравним по модулю $\mu$ с некоторым решением. *Идея:* взять остатки по модулю $\mu$; так как $m_i \mid \mu$, значения многочленов по модулю $m_i$ не меняются.
:::

::: {.corollary ref="cor:lec08:system-disjunction" status="доказано в лекции 8"}
Система с одной переменной $x$ и решениями $z_1, \dots, z_s$ равносильна совокупности $x \equiv z_1 \pmod \mu$ или … или $x \equiv z_s \pmod \mu$.
:::

::: {.definition ref="def:lec08:pairwise"}
$c_1, \dots, c_n$ попарно взаимно просты, если $\gcd(c_i, c_j) = 1$ при всех $i \ne j$.
:::

::: {.lemma ref="lem:lec08:lcm-coprime" status="доказано в лекции 8"}
Для попарно взаимно простых $c_1, \dots, c_n$: $\operatorname{lcm}(c_1, \dots, c_n) = |c_1 \cdots c_n|$. *Идея:* у каждого простого положительна степень не более чем в одном $c_i$, поэтому сумма степеней равна максимуму.
:::

::: {.theorem ref="thm:lec08:crt" status="доказано в лекции 8"}
Китайская теорема об остатках: если $m_1, \dots, m_n > 1$ попарно взаимно просты, то для любых $a_1, \dots, a_n$ система $x \equiv a_i \pmod{m_i}$ имеет единственное решение $x$ с $0 \le x < m_1 \cdots m_n$. *Идея:* единственность — НОК модулей равен произведению; существование — индукция по $n$: первые $n$ сравнений сворачиваются в $x \equiv x_0 \pmod \mu$, и при $\mu u + mv = 1$ число $x_1 = a\mu u + x_0 mv$ решает пару $x \equiv x_0 \pmod \mu$, $x \equiv a \pmod m$.
:::

# Лекция 9 — Множества: аксиомы, подмножества, булеан

::: {.axiom ref="ax:lec09:foundation"}
Нет бесконечных цепочек $x_0 \ni x_1 \ni x_2 \ni \dots$
:::

::: {.proposition ref="prop:lec09:not-self" status="доказано в лекции 9"}
$a \notin a$ для любого $a$; отсюда $a \ne \{a\}$. *Идея:* иначе цепочка $a \ni a \ni \dots$
:::

::: {.definition ref="def:lec09:equal"}
$A = B \iff \forall x\, (x \in A \iff x \in B)$.
:::

::: {.axiom ref="ax:lec09:equality"}
$A = B \wedge B \in C \Rightarrow A \in C$; равные множества взаимозаменяемы.
:::

::: {.definition ref="def:lec09:subset"}
$A \subseteq B \iff \forall x\, (x \in A \Rightarrow x \in B)$; собственное подмножество — $A \subseteq B$, $A \ne B$.
:::

::: {.lemma ref="lem:lec09:subset" status="доказано в лекции 9"}
$A \subseteq A$; $A \subseteq B \subseteq C \Rightarrow A \subseteq C$; $A = B \iff A \subseteq B \wedge B \subseteq A$. *Идея:* произвольный элемент.
:::

::: {.corollary ref="cor:lec09:equal" status="доказано в лекции 9"}
$A = A$; $A = B \wedge B = C \Rightarrow A = C$; $A = B \Rightarrow B = A$. *Идея:* свести к двум включениям и применить свойства $\subseteq$.
:::

::: {.axiom ref="ax:lec09:listing"}
Существует $\{a_1, \dots, a_n\}$: $x \in \{a_1, \dots, a_n\} \iff x = a_1 \vee \ldots \vee x = a_n$; синглетон $\{a\}$. Двух элементов запись не гарантирует: $\{a, b\} = \{a\} \iff a = b$.
:::

::: {.axiom ref="ax:lec09:specification"}
Существует $\{x \in A \mid \varphi(x)\}$: $y \in \{x \in A \mid \varphi(x)\} \iff y \in A \wedge \varphi(y)$.
:::

::: {.definition ref="def:lec09:empty"}
$E$ пусто, если $\forall x\, (x \notin E)$; $\varnothing = \{x \in \N \mid x \ne x\}$.
:::

::: {.lemma ref="lem:lec09:empty" status="доказано в лекции 9"}
Пустое множество — подмножество любого; любые два пустых множества равны. *Идея:* пустая истина.
:::

::: {.corollary ref="cor:lec09:empty-unique" status="доказано в лекции 9"}
$\varnothing$ — единственное пустое множество: например, $\{x \in \Z \mid x^2 = -1\} = \{x \in \R \mid x \ne x\} = \varnothing$.
:::

::: {.definition ref="def:lec09:bounded"}
$\forall x \in A\ \varphi \equiv \forall x\, (x \in A \to \varphi)$, $\exists x \in A\ \varphi \equiv \exists x\, (x \in A \wedge \varphi)$.
:::

::: {.proposition ref="prop:lec09:bounded-neg" status="доказано в лекции 9"}
$\neg\forall x \in A\ \varphi \equiv \exists x \in A\ \neg\varphi$, $\neg\exists x \in A\ \varphi \equiv \forall x \in A\ \neg\varphi$. *Идея:* отрицание кванторов и $\neg(P \to Q) \equiv P \wedge \neg Q$.
:::

::: {.lemma ref="lem:lec09:russell" status="доказано в лекции 9"}
Нет $R$ с $\forall x\, (x \in R \iff x \notin x)$. *Идея:* подставить $x := R$.
:::

::: {.corollary ref="cor:lec09:no-universal" status="доказано в лекции 9"}
$\{x \in A \mid x \notin x\} \notin A$; множества всех множеств нет. *Идея:* рассуждение Рассела внутри $A$.
:::

::: {.axiom ref="ax:lec09:powerset"}
Существует $\mathcal{P}(A)$: $x \in \mathcal{P}(A) \iff x \subseteq A$.
:::

# Лекция 10 — Объединение семейства. Алгебра множеств

::: {.axiom ref="ax:lec10:union"}
Существует $\bigcup A$: $x \in \bigcup A \iff \exists \alpha\, (x \in \alpha \wedge \alpha \in A)$. Индексная запись: $\bigcup_{i \in I} A_i := \bigcup\{A_i \mid i \in I\}$, то есть $x \in \bigcup_{i \in I} A_i \iff \exists i \in I\ (x \in A_i)$. Пересечение непустого семейства $A$ аксиомы не требует: $\bigcap A = \{x \in \alpha_0 \mid \forall \alpha \in A\ (x \in \alpha)\}$ для любого $\alpha_0 \in A$; $\bigcap \varnothing$ не определено.
:::

::: {.definition ref="def:lec10:operations"}
$A \cup B = \bigcup\{A, B\}$, $A \cap B = \{x \in A \mid x \in B\}$, $A \setminus B = \{x \in A \mid x \notin B\}$; непересекающиеся — $A \cap B = \varnothing$.
:::

::: {.lemma ref="lem:lec10:basic-incl" status="доказано в лекции 10"}
$A \cap B \subseteq A \subseteq A \cup B$, $A \cap B \subseteq B \subseteq A \cup B$; $A \setminus B \subseteq A$ и $(A \setminus B) \cap B = \varnothing$. *Идея:* каждое включение — тавтология о принадлежности.
:::

::: {.lemma ref="lem:lec10:subset-equiv" status="доказано в лекции 10"}
$A \subseteq B \iff A \cap B = A \iff A \cup B = B$; для $A, B \subseteq U$ ещё $\iff A \setminus B = \varnothing \iff \bar B \subseteq \bar A$. *Идея:* доказательство по кругу; две последние формы — через тождества алгебры множеств.
:::

::: {.definition ref="def:lec10:complement"}
$\bar A = U \setminus A$ для $A \subseteq U$; $A \setminus B = A \cap \bar B$.
:::

::: {.theorem ref="thm:lec10:identities" status="доказано в лекции 10"}
Коммутативность, ассоциативность, идемпотентность, поглощение, $\bar{\bar A} = A$, две дистрибутивности, законы де Моргана, свойства $\varnothing$ и $U$, $A \cap \bar A = \varnothing$, $A \cup \bar A = U$. Де Морган для разности (без универсума): $A \setminus (B \cup C) = (A \setminus B) \cap (A \setminus C)$, $A \setminus (B \cap C) = (A \setminus B) \cup (A \setminus C)$. *Идея:* поэлементный перевод в логические эквивалентности; на практике — таблица принадлежности из $2^k$ строк.
:::

# Лекция 11 — Упорядоченные пары. Декартово произведение

::: {.definition ref="def:lec11:pair"}
$(a, b) = \{\{a\}, \{a, b\}\}$ (по Куратовскому); $(a, a) = \{\{a\}\}$. Компоненты восстанавливаются: $\bigcup (a, b) = \{a, b\}$, $\bigcap (a, b) = \{a\}$.
:::

::: {.lemma ref="lem:lec11:pair" status="доказано в лекции 11"}
$(a, b) = (c, d) \iff a = c \wedge b = d$. *Идея:* из $\{a\} \in (c, d)$ получить $a = c$, затем разобрать $\{a, b\} = \{c\}$ и $\{a, b\} = \{c, d\}$.
:::

::: {.corollary ref="cor:lec11:pair-swap" status="доказано в лекции 11"}
$(a, b) = (b, a) \iff a = b$.
:::

::: {.definition ref="def:lec11:product"}
$A \times B = \{z \in \mathcal{P}(\mathcal{P}(A \cup B)) \mid \exists a \in A\ \exists b \in B\ z = (a, b)\}$; $A_1 \times \ldots \times A_n$ — скобки слева.
:::

::: {.definition ref="def:lec11:power"}
$A^0 = \{\varnothing\}$, $A^1 = A$, $A^n = A \times \ldots \times A$ при $n \ge 2$; $A^{n+1} = A^n \times A$ только при $n \ge 1$. Так, $\R^3 = \R^2 \times \R$ и $(x, y, z) = ((x, y), z)$, но $\R \times \R^2 \ne \R^3$.
:::

::: {.definition ref="def:lec11:tuple"}
$(a_1, \dots, a_n) = ((\dots(a_1, a_2), \dots), a_n)$ при $n \ge 2$.
:::

::: {.lemma ref="lem:lec11:tuple" status="доказано в лекции 11"}
$(a_1, \dots, a_n) = (b_1, \dots, b_n) \iff \forall i\ a_i = b_i$. *Идея:* критерий равенства пар $n - 1$ раз.
:::

# Лекция 12 — Бинарные отношения

::: {.definition ref="def:lec12:relation"}
Бинарное отношение между $A$ и $B$ — любое $R \subseteq A \times B$; при $A = B$ — отношение на $A$. Запись $xRy$ означает $(x, y) \in R$.
:::

::: {.definition ref="def:lec12:dom-rng"}
$\operatorname{dom} R = \{a \mid \exists b\, (a, b) \in R\}$, $\operatorname{rng} R = \{b \mid \exists a\, (a, b) \in R\}$, поле — $\operatorname{dom} R \cup \operatorname{rng} R$.
:::

::: {.definition ref="def:lec12:identity"}
$\mathrm{id}_A = \{(x, x) \mid x \in A\}$.
:::

::: {.definition ref="def:lec12:converse"}
$R^{-1} = \{(b, a) \mid (a, b) \in R\}$; $(b, a) \in R^{-1} \iff (a, b) \in R$, $\operatorname{dom} R^{-1} = \operatorname{rng} R$, $\operatorname{rng} R^{-1} = \operatorname{dom} R$.
:::

::: {.definition ref="def:lec12:complement"}
Для $R \subseteq A \times B$: $\overline{R} = (A \times B) \setminus R$ (зависит от выбора $A$ и $B$).
:::

::: {.lemma ref="lem:lec12:converse-props" status="доказано в лекции 12"}
$(P^{-1})^{-1} = P$; $(P \cup Q)^{-1} = P^{-1} \cup Q^{-1}$; $(P \cap Q)^{-1} = P^{-1} \cap Q^{-1}$; для $P \subseteq A \times B$: $(\overline{P})^{-1} = \overline{P^{-1}}$ (дополнения до $A \times B$ и $B \times A$). *Идея:* цепочка равносильностей для произвольной пары.
:::

::: {.corollary ref="cor:lec12:converse-mono" status="доказано в лекции 12"}
Если $P \subseteq Q$, то $P^{-1} \subseteq Q^{-1}$. *Идея:* $Q = P \cup Q$ и обращение объединения.
:::

::: {.proposition ref="prop:lec12:converse-ne-complement" status="доказано в лекции 12"}
Если $R \subseteq A \times B$, $A \ne \varnothing$, $B \ne \varnothing$, то $R^{-1} \ne \overline{R}$. *Идея:* $R = \varnothing$ не подходит; из $(a, b) \in R$ получаем $b \in A \cap B$, и для пары $(b, b)$ выходит $(b, b) \in R \iff (b, b) \notin R$.
:::

::: {.definition ref="def:lec12:composition"}
$Q \circ P = \{(a, c) \mid \exists b\, (aPb \wedge bQc)\}$ — сначала $P$, потом $Q$.
:::

::: {.proposition ref="prop:lec12:identity-unit" status="доказано в лекции 12"}
Если $R \subseteq A \times B$, то $R \circ \mathrm{id}_A = R = \mathrm{id}_B \circ R$.
:::

::: {.theorem ref="thm:lec12:assoc" status="доказано в лекции 12"}
$R \circ (Q \circ P) = (R \circ Q) \circ P$. *Идея:* обе части — «путь $P$, $Q$, $R$»; переставить $\exists b\, \exists c$ и вносить/выносить конъюнкт, не зависящий от переменной квантора.
:::

::: {.theorem ref="thm:lec12:converse-comp" status="доказано в лекции 12"}
$(Q \circ P)^{-1} = P^{-1} \circ Q^{-1}$. *Идея:* $(c, a) \in Q \circ P \iff \exists b\, (cPb \wedge bQa) \iff \exists b\, (aQ^{-1}b \wedge bP^{-1}c)$.
:::

::: {.lemma ref="lem:lec12:distrib" status="доказано в лекции 12"}
$(P \cup Q) \circ R = (P \circ R) \cup (Q \circ R)$; $(P \cap Q) \circ R \subseteq (P \circ R) \cap (Q \circ R)$, и включение бывает строгим. Так же слева: $R \circ (P \cup Q) = (R \circ P) \cup (R \circ Q)$. *Идея:* $\exists$ проходит сквозь $\vee$, но из $\exists (A \wedge B)$ следует лишь $\exists A \wedge \exists B$; левая версия — обращением.
:::

::: {.definition ref="def:lec12:image"}
Образ $R[X] = \{b \mid \exists a \in X\ aRb\}$, прообраз $R^{-1}[X] = \{a \mid \exists b \in X\ aRb\}$.
:::

::: {.proposition ref="prop:lec12:image-props" status="доказано в лекции 12"}
$R[X \cup Y] = R[X] \cup R[Y]$; $X \subseteq Y \Rightarrow R[X] \subseteq R[Y]$; $R[\varnothing] = \varnothing$; $R[X \cap Y] \subseteq R[X] \cap R[Y]$ (бывает строго); $(R \circ Q)[X] = R[Q[X]]$. *Идея:* те же законы о кванторах, что и для композиции; включение для $\cap$ — из монотонности.
:::

# Лекция 13 — Функции

::: {.definition ref="def:lec13:functional-injective"}
$R$ функционально, если $(xRy \wedge xRz) \Longrightarrow y = z$; инъективно, если $(yRx \wedge zRx) \Longrightarrow y = z$ (для всех $x$, $y$, $z$).
:::

::: {.definition ref="def:lec13:total-surjective"}
$R$ тотально для $Z$, если $\forall x \in Z\ \exists y\ xRy$ (то есть $Z \subseteq \operatorname{dom} R$); сюръективно для $Z$, если $\forall x \in Z\ \exists y\ yRx$ (то есть $Z \subseteq \operatorname{rng} R$). Для $R \subseteq A \times B$ по умолчанию $Z = A$ для тотальности и $Z = B$ для сюръективности.
:::

::: {.lemma ref="lem:lec13:duality" status="доказано в лекции 13"}
$R$ функционально $\iff$ $R^{-1}$ инъективно; $R$ инъективно $\iff$ $R^{-1}$ функционально; $R$ тотально для $Z$ $\iff$ $R^{-1}$ сюръективно для $Z$; $R$ сюръективно для $Z$ $\iff$ $R^{-1}$ тотально для $Z$. *Идея:* $xRy \iff yR^{-1}x$ превращает одно определение в другое; вторые половины — применением первых к $R^{-1}$.
:::

::: {.lemma ref="lem:lec13:composition" status="доказано в лекции 13"}
Пусть $Q \subseteq A \times B$, $R \subseteq B \times C$. Если $Q$ и $R$ функциональны (инъективны), то $R \circ Q$ функционально (инъективно); если $Q$ тотально для $A$, а $R$ — для $B$, то $R \circ Q$ тотально для $A$; если $Q$ сюръективно для $B$, а $R$ — для $C$, то $R \circ Q$ сюръективно для $C$. *Идея:* функциональность и тотальность — прямо по путям из двух стрелок; инъективность и сюръективность — двойственностью и $(R \circ Q)^{-1} = Q^{-1} \circ R^{-1}$.
:::

::: {.proposition ref="prop:lec13:cap" status="доказано в лекции 13"}
Если $R$ инъективно, то $R[X \cap Y] = R[X] \cap R[Y]$; если $R$ функционально, то $R^{-1}[X \cap Y] = R^{-1}[X] \cap R^{-1}[Y]$. *Идея:* две стрелки в общую точку образа выходят из одной точки; для прообраза — применить к инъективному $R^{-1}$.
:::

::: {.proposition ref="prop:lec13:preimage-image" status="доказано в лекции 13"}
Если $R \subseteq A \times B$ тотально и $X \subseteq A$, то $X \subseteq R^{-1}[R[X]]$ (равенство не обязательно даже для функций).
:::

::: {.definition ref="def:lec13:function"}
$f \subseteq A \times B$ — функция из $A$ в $B$ ($f\colon A \to B$), если $f$ функционально и тотально для $A$. Тогда $\operatorname{dom} f = A$, $\operatorname{rng} f \subseteq B$; множество $B$ функцией не определяется.
:::

::: {.definition ref="def:lec13:value"}
Для $f\colon A \to B$ и $x \in A$ значение $f(x)$ — единственный $y$ с $(x, y) \in f$; $f[\{x\}] = \{f(x)\}$.
:::

::: {.lemma ref="lem:lec13:equality" status="доказано в лекции 13"}
Для $f\colon A \to B$, $g\colon C \to D$: $f = g \iff A = C \wedge \forall x \in A\ f(x) = g(x)$. *Идея:* $A = \operatorname{dom} f$; при равных значениях каждая пара $f$ лежит в $g$ и наоборот.
:::

::: {.proposition ref="prop:lec13:comp-values" status="доказано в лекции 13"}
Если $f\colon A \to B$, $g\colon B \to C$, то $g \circ f\colon A \to C$ и $(g \circ f)(a) = g(f(a))$. *Идея:* лемма о композиции; путь $a \to f(a) \to g(f(a))$.
:::

::: {.definition ref="def:lec13:functions-set"}
$B^A = \{f \in \mathcal{P}(A \times B) \mid f\colon A \to B\}$; $B^\varnothing = \{\varnothing\}$, $\varnothing^A = \varnothing$ при $A \ne \varnothing$.
:::

::: {.definition ref="def:lec13:bijection"}
Функция $f\colon A \to B$ — инъекция, если инъективна; сюръекция, если сюръективна для $B$; биекция (взаимно однозначное соответствие), если и то и другое.
:::

::: {.proposition ref="prop:lec13:by-values" status="доказано в лекции 13"}
$f\colon A \to B$ инъективна тогда и только тогда, когда из $f(x) = f(y)$ при $x, y \in A$ следует $x = y$; сюръективна тогда и только тогда, когда $\forall y \in B\ \exists x \in A\ f(x) = y$.
:::

::: {.lemma ref="lem:lec13:bijection-converse" status="доказано в лекции 13"}
$R \subseteq A \times B$ — биекция из $A$ в $B$ $\iff$ $R^{-1}$ — биекция из $B$ в $A$ (обратная функция $f^{-1}$). *Идея:* двойственность переставляет четыре свойства.
:::

::: {.corollary ref="cor:lec13:bijection-comp" status="доказано в лекции 13"}
Если $f\colon A \to B$ и $g\colon B \to C$ — биекции (инъекции, сюръекции), то $g \circ f\colon A \to C$ — биекция (инъекция, сюръекция); для биекций $(g \circ f)^{-1} = f^{-1} \circ g^{-1}$.
:::

::: {.lemma ref="lem:lec13:criteria" status="доказано в лекции 13"}
Для $R \subseteq A \times B$: функционально $\iff$ $R \circ R^{-1} \subseteq \mathrm{id}_B$; инъективно $\iff$ $R^{-1} \circ R \subseteq \mathrm{id}_A$; сюръективно $\iff$ $\mathrm{id}_B \subseteq R \circ R^{-1}$; тотально $\iff$ $\mathrm{id}_A \subseteq R^{-1} \circ R$. *Идея:* $(x, y) \in R \circ R^{-1} \iff \exists z\, (zRx \wedge zRy)$; пункты 2 и 4 — применить 1 и 3 к $R^{-1}$.
:::

::: {.corollary ref="cor:lec13:bijection-inverse" status="доказано в лекции 13"}
$R \subseteq A \times B$ — биекция из $A$ в $B$ $\iff$ $R^{-1} \circ R = \mathrm{id}_A$ и $R \circ R^{-1} = \mathrm{id}_B$.
:::

# Лекция 14 — Равномощность. Теорема Кантора

::: {.definition ref="def:lec14:equinumerous"}
$A \sim B$ ($A$ и $B$ равномощны), если существует биекция $f\colon A \to B$; запись $A \sim_f B$.
:::

::: {.lemma ref="lem:lec14:equiv" status="доказано в лекции 14"}
$A \sim A$; $A \sim B \Rightarrow B \sim A$; $A \sim B \wedge B \sim C \Rightarrow A \sim C$. *Идея:* $\mathrm{id}_A$, обратная биекция, композиция биекций.
:::

::: {.proposition ref="prop:lec14:onto-image" status="доказано в лекции 14"}
Если $f\colon A \to B$ — инъекция, то $A \sim_f f[A]$ и $X \sim f[X]$ для всех $X \subseteq A$.
:::

::: {.proposition ref="prop:lec14:glue" status="доказано в лекции 14"}
Склейка биекций: если $A \cap C = \varnothing$, $B \cap D = \varnothing$, $A \sim_f B$ и $C \sim_g D$, то $A \cup C \sim_{f \cup g} B \cup D$. *Идея:* $f \cup g$ — функция, так как области не пересекаются; инъективность внутри куска — от $f$ или $g$, между кусками — из $B \cap D = \varnothing$.
:::

::: {.theorem ref="thm:lec14:cantor" status="доказано в лекции 14"}
$A \nsim \mathcal{P}(A)$ для любого $A$; более того, сюръекции $A \to \mathcal{P}(A)$ нет. *Идея:* диагональное множество $X = \{a \in A \mid a \notin \varphi(a)\}$ отличается от каждого $\varphi(a)$ в точке $a$.
:::

::: {.theorem ref="thm:lec14:arithmetic" status="доказано в лекции 14 (пункт 4 — в задаче)"}
Если $A \sim B$, то $A \times C \sim B \times C$, $A^C \sim B^C$, $C^A \sim C^B$; $A \times B \sim B \times A$; $(A \times B) \times C \sim A \times (B \times C)$; $(A \times B)^C \sim A^C \times B^C$; $(C^B)^A \sim C^{A \times B}$. *Идея:* явные биекции; $C^A \to C^B$ — $f \mapsto f \circ \varphi^{-1}$; последний пункт — каррирование $f \mapsto ((a, b) \mapsto (f(a))(b))$.
:::

# Лекция 15 — Индикаторы. Вложения. Теорема Кантора — Шрёдера — Бернштейна

::: {.definition ref="def:lec15:n-set"}
$\mathbf{n} = \{k \in \N \mid k < n\} = \{0, \dots, n - 1\}$; $\mathbf{0} = \varnothing$, $\mathbf{2} = \{0, 1\}$.
:::

::: {.definition ref="def:lec15:indicator"}
Для $A \subseteq X$ индикатор $1_A\colon X \to \mathbf{2}$: $1_A(x) = 1$ при $x \in A$, $0$ при $x \notin A$.
:::

::: {.lemma ref="lem:lec15:indicator-eq" status="доказано в лекции 15"}
Для $A, B \subseteq X$: $A = B \iff 1_A = 1_B$.
:::

::: {.lemma ref="lem:lec15:powerset" status="доказано в лекции 15"}
$\mathcal{P}(X) \sim \mathbf{2}^X$. *Идея:* $A \mapsto 1_A$; прообраз функции $g$ — множество $g^{-1}[\{1\}]$.
:::

::: {.proposition ref="prop:lec15:indicator-ops" status="доказано в лекции 15"}
$1_{B \cap C} = 1_B 1_C$, $1_{B \cup C} = 1_B + 1_C - 1_B 1_C$, $1_{\overline{B}} = 1 - 1_B$; $B \subseteq C \iff 1_B \le 1_C$ всюду. *Идея:* перебор четырёх случаев; $1_B^2 = 1_B$.
:::

::: {.theorem ref="thm:lec15:tuples" status="доказано в лекции 15 (индукция по $n$)"}
$A^n \sim A^{\mathbf{n}}$ для любого $A$ и $n \in \N$; биекция $A^{\mathbf{n}} \to A^n$ — $f \mapsto (f(0), \dots, f(n - 1))$. *Идея:* индукция по $n$: функция на $\mathbf{m + 1}$ — это её сужение на $\mathbf{m}$ плюс значение в точке $m$, а кортеж длины $m + 1$ — кортеж длины $m$ плюс компонента.
:::

::: {.definition ref="def:lec15:embedding"}
$A \lesssim B$ ($A$ вкладывается в $B$), если существует инъекция $f\colon A \to B$ (вложение); запись $A \lesssim_f B$.
:::

::: {.lemma ref="lem:lec15:embed-props" status="доказано в лекции 15"}
$A \lesssim A$; $A \lesssim B \wedge B \lesssim C \Rightarrow A \lesssim C$; $A \sim B \Rightarrow A \lesssim B \wedge B \lesssim A$; $A \lesssim B \iff \exists D \subseteq B\ A \sim D$.
:::

::: {.theorem ref="thm:lec15:csb" status="без доказательства"}
Кантор — Шрёдер — Бернштейн: если $A \lesssim B$ и $B \lesssim A$, то $A \sim B$.
:::

::: {.corollary ref="cor:lec15:powerset-not-embed" status="доказано в лекции 15"}
$\mathcal{P}(A) \not\lesssim A$ ни для какого $A$. *Идея:* $A \lesssim \mathcal{P}(A)$ через $x \mapsto \{x\}$, затем теорема Кантора — Шрёдера — Бернштейна и теорема Кантора.
:::

::: {.definition ref="def:lec15:strict"}
$A \lnsim B$, если $A \lesssim B$ и $A \nsim B$; по теореме Кантора — Шрёдера — Бернштейна это то же, что $A \lesssim B$ и $B \not\lesssim A$.
:::

::: {.definition ref="def:lec15:countable"}
$X$ счётно, если $X \sim \N$. Счётны $\N^2$, $\Z$, $\Q$; $\mathcal{P}(\N) \sim \R$ (принимается без доказательства) — нет.
:::

# Лекция 16 — Конечные множества. Основы подсчёта

::: {.definition ref="def:lec16:finite"}
$A$ конечно, если $A \sim \mathbf{n}$ для некоторого $n \in \N$; иначе бесконечно.
:::

::: {.definition ref="def:lec16:restriction"}
Сужение $f\colon A \to B$ на $X \subseteq A$: $f \restriction X = f \cap (X \times B)\colon X \to B$.
:::

::: {.lemma ref="lem:lec16:n1-n" status="доказано в лекции 16"}
Инъекции $\mathbf{n + 1} \to \mathbf{n}$ не существует. *Идея:* наименьший контрпример $n = m + 1$; переставив $f(n)$ и $m$, получаем инъекцию $\mathbf{m + 1} \to \mathbf{m}$.
:::

::: {.theorem ref="thm:lec16:pigeonhole" status="доказано в лекции 16"}
Принцип Дирихле: при $m > n$ никакая $f\colon \mathbf{m} \to \mathbf{n}$ не инъективна, $\mathbf{m} \not\lesssim \mathbf{n}$. *Идея:* $\mathbf{n + 1} \subseteq \mathbf{m}$.
:::

::: {.corollary ref="cor:lec16:distinct" status="доказано в лекции 16"}
$m \ne n \Rightarrow \mathbf{m} \nsim \mathbf{n}$.
:::

::: {.corollary ref="cor:lec16:unique" status="доказано в лекции 16"}
Для конечного $A$ число $n$ с $A \sim \mathbf{n}$ единственно.
:::

::: {.definition ref="def:lec16:cardinality"}
$|A|$ — единственное $n$ с $A \sim \mathbf{n}$ (мощность, число элементов конечного $A$); для конечных $A \sim B \iff |A| = |B|$.
:::

::: {.theorem ref="thm:lec16:no-surjection" status="доказано в лекции 16"}
При $m > n$ никакая $f\colon \mathbf{n} \to \mathbf{m}$ не сюръективна. *Идея:* наименьший прообраз даёт инъекцию $\mathbf{m} \to \mathbf{n}$.
:::

::: {.lemma ref="lem:lec16:invariant" status="доказано в лекции 16"}
Конечность, бесконечность и счётность сохраняются при $\sim$.
:::

::: {.lemma ref="lem:lec16:countable-infinite" status="доказано в лекции 16"}
Если $A$ счётно и $A \lesssim B$, то $B$ бесконечно.
:::

::: {.lemma ref="lem:lec16:subset-n" status="доказано в лекции 16 (набросок)"}
Любое $A \subseteq \N$ конечно или счётно. *Идея:* перечислить элементы по возрастанию.
:::

::: {.corollary ref="cor:lec16:sub-countable" status="доказано в лекции 16"}
$A \lesssim B$, $B$ счётно $\Rightarrow$ $A$ конечно или счётно.
:::

::: {.corollary ref="cor:lec16:sub-finite" status="доказано в лекции 16"}
$A \lesssim B$, $B$ конечно $\Rightarrow$ $A$ конечно и $|A| \le |B|$.
:::

::: {.definition ref="def:lec16:uncountable"}
Несчётное множество — бесконечное и не счётное; конечные и счётные вместе — не более чем счётные (это ровно $A \lesssim \N$).
:::

::: {.lemma ref="lem:lec16:infinite-n" status="доказано в лекции 16 (набросок, с аксиомой выбора)"}
Если $A$ бесконечно, то $\N \lesssim A$.
:::

::: {.corollary ref="cor:lec16:infinite-iff" status="доказано в лекции 16"}
$A$ бесконечно $\iff$ $\N \lesssim A$.
:::

::: {.theorem ref="thm:lec16:sum" status="доказано в лекции 16"}
Правило суммы: для конечных $A$, $B$ с $A \cap B = \varnothing$: $|A \cup B| = |A| + |B|$. *Идея:* $h = f$ на $A$, $h = n + g$ на $B$.
:::

::: {.corollary ref="cor:lec16:union" status="доказано в лекции 16"}
Для конечных $A$, $B$: $|A \cup B| = |A| + |B| - |A \cap B|$.
:::

::: {.corollary ref="cor:lec16:union-le" status="доказано в лекции 16"}
$|A \cup B| \le |A| + |B|$.
:::

::: {.corollary ref="cor:lec16:proper" status="доказано в лекции 16"}
Если $B$ конечно и $A \subsetneq B$, то $|A| < |B|$.
:::

::: {.theorem ref="thm:lec16:product" status="доказано в лекции 16"}
Правило произведения: $|A \times B| = |A| \cdot |B|$ для конечных $A$, $B$. *Идея:* $h(x, y) = m f(x) + g(y)$ и единственность деления с остатком.
:::

::: {.corollary ref="cor:lec16:power" status="доказано в лекции 16"}
$|A^n| = |A|^n$.
:::

::: {.corollary ref="cor:lec16:functions" status="доказано в лекции 16"}
$|B^A| = |B|^{|A|}$ (с $0^0 = 1$). *Идея:* $B^A \sim \mathbf{m}^{\mathbf{n}} \sim \mathbf{m}^n$.
:::

::: {.corollary ref="cor:lec16:powerset" status="доказано в лекции 16"}
$|\mathcal{P}(A)| = 2^{|A|}$.
:::

::: {.proposition ref="prop:lec16:image-le" status="доказано в лекции 16"}
Для конечного $A$ и $f\colon A \to B$: $|f[A]| \le |A|$.
:::

::: {.theorem ref="thm:lec16:inj-surj" status="доказано в лекции 16"}
Если $A$, $B$ конечны и $|A| = |B|$, то $f\colon A \to B$ инъективна $\iff$ сюръективна. *Идея:* инъекция — образ равномощен $A$ и не может быть собственной частью $B$; сюръекция со склейкой — выброшенная точка уменьшает образ.
:::

# Лекция 17 — Размещения и сочетания. Бином Ньютона

::: {.definition ref="def:lec17:inj"}
$\mathrm{Inj}(A, B)$ — множество инъекций из $A$ в $B$.
:::

::: {.lemma ref="lem:lec17:only-size" status="доказано в лекции 17"}
Если $A' \sim A$ и $B' \sim B$, то $\mathrm{Inj}(A', B') \sim \mathrm{Inj}(A, B)$. *Идея:* $f \mapsto \psi \circ f \circ \varphi^{-1}$.
:::

::: {.definition ref="def:lec17:factorial"}
$0! = 1$, $(n + 1)! = (n + 1) \cdot n!$.
:::

::: {.lemma ref="lem:lec17:inj-count" status="доказано в лекции 17"}
$|\mathrm{Inj}(\mathbf{m}, \mathbf{n})| = \frac{n!}{(n - m)!}$ при $m \le n$ и $0$ при $m > n$. *Идея:* индукция по $m$; инъекции из $\mathbf{m + 1}$ делятся на $n$ равных групп по значению в точке $m$.
:::

::: {.definition ref="def:lec17:arrangement"}
Размещение длины $m$ — кортеж из попарно различных элементов; $A_n^m = |\mathrm{Inj}(\mathbf{m}, \mathbf{n})| = n(n - 1) \cdots (n - m + 1) = n^{(m)}$ при $m \le n$, $A_n^m = 0$ при $m > n$.
:::

::: {.definition ref="def:lec17:permutation"}
Перестановка множества $A$ — биекция $A \to A$.
:::

::: {.lemma ref="lem:lec17:perm-count" status="доказано в лекции 17"}
У $n$-элементного множества $n!$ перестановок. *Идея:* инъекция $\mathbf{n} \to \mathbf{n}$ — биекция.
:::

::: {.definition ref="def:lec17:binomial"}
$\mathcal{P}_k(A)$ — $k$-элементные подмножества ($k$-сочетания) $A$; $C_n^k = |\mathcal{P}_k(\mathbf{n})|$ — число сочетаний из $n$ по $k$; $C_n^k = 0$ при $k > n$. Сочетание с повторениями — выбор $m$ предметов из $n$ видов с повторениями и без учёта порядка; их $C_{n + m - 1}^m$ (шары и перегородки).
:::

::: {.lemma ref="lem:lec17:pascal" status="доказано в лекции 17"}
$C_{n + 1}^{k + 1} = C_n^{k + 1} + C_n^k$ для любых $n, k \in \N$. *Идея:* делим подмножества $\mathbf{n + 1}$ по тому, содержат ли они $n$.
:::

::: {.lemma ref="lem:lec17:binom-formula" status="доказано в лекции 17"}
$C_n^k = \frac{n!}{k!\,(n - k)!}$ при $k \le n$. *Идея:* индукция по $n$ через тождество Паскаля.
:::

::: {.lemma ref="lem:lec17:symmetry" status="доказано в лекции 17"}
$C_n^k = C_n^{n - k}$ при $0 \le k \le n$. *Идея:* биекция $X \mapsto \mathbf{n} \setminus X$.
:::

::: {.theorem ref="thm:lec17:binomial" status="доказано в лекции 17"}
$(a + b)^n = \sum_{k = 0}^n C_n^k a^k b^{n - k}$ для $a, b \in \R$, $n \in \N$. *Идея:* $(1 + x)^n$ индукцией с тождеством Паскаля, затем вынести $b^n$.
:::

# Лекция 18 — Зависимое произведение. Формула включений-исключений

::: {.theorem ref="thm:lec18:dependent" status="доказано в лекции 18"}
Правило зависимого произведения: если $P$ конечно, $S \subseteq P \times Q$ и каждое $S[\{x\}]$ конечно, $|S[\{x\}]| = f(x)$, то $S$ конечно и $|S| = \sum_{x \in P} f(x)$. *Идея:* индукция по $|P|$ и правило суммы.
:::

::: {.corollary ref="cor:lec18:dependent-const" status="доказано в лекции 18"}
Если $|S[\{x\}]| = k$ для всех $x \in P$, то $|S| = |P| \cdot k$.
:::

::: {.definition ref="def:lec18:multinomial"}
При $a_1 + \dots + a_k = n$: $P(n; a_1, \dots, a_k) = \frac{n!}{a_1! \cdots a_k!}$ — число кортежей $(A_1, \dots, A_k)$ попарно непересекающихся множеств с $A_1 \cup \dots \cup A_k = \mathbf{n}$ и $|A_i| = a_i$, то есть разбиений на *нумерованные* части. Для ненумерованных частей ответ меньше: разбить $6$ человек на три пары можно $15$ способами, а не $P(6; 2, 2, 2) = 90$.
:::

::: {.lemma ref="lem:lec18:sum-indicator" status="доказано в лекции 18"}
$|B| = \sum_{x \in U} 1_B(x)$ для конечного $U$ и $B \subseteq U$.
:::

::: {.theorem ref="thm:lec18:incl-excl" status="доказано в лекции 18"}
$|A_1 \cup \dots \cup A_n| = \sum_{\varnothing \ne I \subseteq \{1, \dots, n\}} (-1)^{|I| - 1} |A_I|$. *Идея:* сравнить вклад каждой точки через индикаторы; точка из $t \ge 1$ множеств учтена $\sum_{k \ge 1} (-1)^{k - 1} C_t^k = 1$ раз.
:::

::: {.corollary ref="cor:lec18:symmetric" status="доказано в лекции 18"}
Симметричный случай: если $X$ конечно, $A_1, \dots, A_n \subseteq X$, $|A_I| = a_k$ для всех $I$ с $|I| = k$ и $a_0 = |X|$, то $|X \setminus (A_1 \cup \dots \cup A_n)| = \sum_{k = 0}^n (-1)^k C_n^k a_k$. *Идея:* наборов $I$ размера $k$ ровно $C_n^k$; вычесть формулу включений-исключений из $|X|$.
:::

::: {.proposition ref="prop:lec18:totient" status="доказано в лекции 18"}
$\varphi(m) = m \prod_{i} \bigl(1 - \frac{1}{p_i}\bigr)$ по всем простым делителям $p_i$ числа $m > 1$. *Идея:* включения-исключения по свойствам «$p_i \mid x$» на $\mathbf{m}$.
:::

# Лекция 19 — Порядки

::: {.definition ref="def:lec19:properties"}
$R$ рефлексивно для $Z$: $\forall x \in Z\ xRx$; иррефлексивно: $\forall x\ \neg xRx$; симметрично: $xRy \Rightarrow yRx$; антисимметрично: $xRy \wedge yRx \Rightarrow x = y$; транзитивно: $xRy \wedge yRz \Rightarrow xRz$.
:::

::: {.lemma ref="lem:lec19:algebraic" status="доказано в лекции 19"}
Для $R \subseteq A^2$: рефлексивно $\iff$ $\mathrm{id}_A \subseteq R$; иррефлексивно $\iff$ $\mathrm{id}_A \cap R = \varnothing$; симметрично $\iff$ $R = R^{-1}$; антисимметрично $\iff$ $R \cap R^{-1} \subseteq \mathrm{id}_A$; транзитивно $\iff$ $R \circ R \subseteq R$.
:::

::: {.definition ref="def:lec19:strict"}
Строгий (частичный) порядок — иррефлексивное транзитивное отношение; он асимметричен.
:::

::: {.definition ref="def:lec19:nonstrict"}
Нестрогий (частичный) порядок — рефлексивное антисимметричное транзитивное отношение.
:::

::: {.definition ref="def:lec19:poset"}
Ч.у.м. $(A, <)$ — множество с порядком; $(A, <, \le)$ — со строгой и нестрогой версиями.
:::

::: {.theorem ref="thm:lec19:strict-nonstrict" status="доказано в лекции 19"}
$\varphi(P) = P \cup \mathrm{id}_A$ и $\psi(Q) = Q \setminus \mathrm{id}_A$ — взаимно обратные биекции между строгими и нестрогими порядками на $A$.
:::

::: {.definition ref="def:lec19:maximal"}
$x \in B$ максимален в $B$, если $\forall y \in B\ \neg\, x < y$; минимален, если $\forall y \in B\ \neg\, y < x$.
:::

::: {.definition ref="def:lec19:greatest"}
$x \in B$ наибольший в $B$, если $\forall y \in B\ y \le x$; наименьший — если $\forall y \in B\ x \le y$.
:::

::: {.lemma ref="lem:lec19:greatest-unique" status="доказано в лекции 19"}
Если $x$ — наибольший в $B$, то $\max B = \{x\}$; наибольший элемент единствен.
:::

::: {.definition ref="def:lec19:bounds"}
$B^{\triangle}$ — верхние грани $B$ (все $x$ с $y \le x$ при $y \in B$), $B^{\triangledown}$ — нижние.
:::

::: {.definition ref="def:lec19:sup"}
$\sup B$ — наименьший элемент $B^{\triangle}$, $\inf B$ — наибольший элемент $B^{\triangledown}$ (если существуют).
:::

::: {.definition ref="def:lec19:lattice"}
Решётка — ч.у.м., где у любых двух элементов есть $\sup$ и $\inf$; например $(\mathcal{P}(A), \subsetneq)$ и $(\N, \mid)$.
:::

::: {.definition ref="def:lec19:linear"}
Порядок линеен, если $\forall x, y\ (x \le y \vee y \le x)$.
:::

::: {.definition ref="def:lec19:chain"}
Цепь — подмножество из попарно сравнимых элементов; антицепь — из попарно несравнимых различных.
:::

::: {.definition ref="def:lec19:isomorphism"}
Изоморфизм ч.у.м. — биекция $\alpha$ с $x <_A y \iff \alpha(x) <_B \alpha(y)$; запись $\mathcal{A} \cong \mathcal{B}$.
:::

::: {.lemma ref="lem:lec19:iso-equiv" status="доказано в лекции 19"}
$\cong$ рефлексивно, симметрично и транзитивно (через $\mathrm{id}$, $\alpha^{-1}$, $\beta \circ \alpha$).
:::

::: {.lemma ref="lem:lec19:iso-preserves" status="доказано в лекции 19"}
Изоморфизм $\alpha$ сохраняет линейность, $\max \alpha[X] = \alpha[\max X]$ и $\sup \alpha[X] = \alpha(\sup X)$; так же для минимумов и инфимумов.
:::

# Лекция 20 — Эквивалентности и разбиения

::: {.definition ref="def:lec20:equivalence"}
Эквивалентность на $A$ — рефлексивное, симметричное и транзитивное отношение $E \subseteq A^2$; иначе $\mathrm{id}_A \subseteq E$, $E = E^{-1}$, $E \circ E \subseteq E$. Сравнимость по модулю как отношение: ${\equiv_m} = \{(x, y) \in \Z^2 \mid x \equiv y \pmod m\}$.
:::

::: {.definition ref="def:lec20:kernel"}
Ядро функции $f\colon A \to B$: $\ker f = \{(x, y) \in A^2 \mid f(x) = f(y)\}$ — эквивалентность на $A$; $\ker f = \mathrm{id}_A$ $\iff$ $f$ инъективна.
:::

::: {.proposition ref="prop:lec20:criterion" status="доказано в лекции 20"}
$R \subseteq A^2$ — эквивалентность $\iff$ $(R \circ R^{-1}) \cup \mathrm{id}_A = R$. *Идея:* для эквивалентности $R \subseteq R \circ R \subseteq R$; обратно — обратить обе части равенства.
:::

::: {.definition ref="def:lec20:class"}
Класс $[x]_E = \{z \in A \mid xEz\} = E[\{x\}]$; фактор-множество $A/E = \{[x]_E \mid x \in A\}$.
:::

::: {.lemma ref="lem:lec20:classes" status="доказано в лекции 20"}
$x \in [x]_E$; $[x]_E \cap [y]_E \ne \varnothing \iff xEy \iff [x]_E = [y]_E$.
:::

::: {.proposition ref="prop:lec20:projection" status="доказано в лекции 20"}
Проекция $p(x) = [x]_E$ — сюръекция $A \to A/E$ с $\ker p = E$; для $f\colon A \to B$ отображение $[x]_{\ker f} \mapsto f(x)$ — биекция $A/\ker f \to f[A]$. *Идея:* значение $f(x)$ не зависит от представителя класса.
:::

::: {.definition ref="def:lec20:partition"}
Разбиение $A$ — $\Sigma \subseteq \mathcal{P}(A)$ с $\varnothing \notin \Sigma$, $\bigcup \Sigma = A$ и $\sigma \cap \tau \ne \varnothing \Rightarrow \sigma = \tau$ для $\sigma, \tau \in \Sigma$.
:::

::: {.theorem ref="thm:lec20:eq-partitions" status="доказано в лекции 20"}
$\pi(E) = A/E$ и $\varepsilon(\Sigma) = \{(x, y) \mid \exists \sigma \in \Sigma\ (x, y \in \sigma)\}$ переводят эквивалентности в разбиения и обратно, и $\varepsilon(\pi(E)) = E$, $\pi(\varepsilon(\Sigma)) = \Sigma$. *Идея:* класс $x$ относительно $\varepsilon(\Sigma)$ — единственная часть $\Sigma$, содержащая $x$.
:::

::: {.corollary ref="cor:lec20:bijection" status="доказано в лекции 20"}
$\pi\colon \mathrm{Eq}(A) \to \Pi(A)$ — биекция, $\varepsilon = \pi^{-1}$.
:::

::: {.proposition ref="prop:lec20:sum-classes" status="доказано в лекции 20"}
Для конечного $A$: $|A| = \sum_{\sigma \in A/E} |\sigma|$; если все классы из $k$ элементов, то $|A| = k \cdot |A/E|$. *Идея:* правило зависимого произведения для пар (класс, его элемент).
:::

::: {.definition ref="def:lec20:bell"}
Число Белла $B_n$ — число разбиений (эквивалентностей) $n$-элементного множества: $1, 1, 2, 5, 15, 52, 203, \dots$
:::

::: {.theorem ref="thm:lec20:bell" status="доказано в лекции 20"}
$B_0 = 1$, $B_{n + 1} = \sum_{k = 0}^{n} C_n^k B_k$. *Идея:* разбиение $\mathbf{n + 1}$ задаётся «попутчиками» $X' \subseteq \mathbf{n}$ элемента $n$ и разбиением $\mathbf{n} \setminus X'$; группируем по $|X'|$.
:::

::: {.definition ref="def:lec20:chain-partition"}
Длина цепи (антицепи) — число её элементов; разбиение на цепи (антицепи) — разбиение ч.у.м., все части которого цепи (антицепи).
:::

::: {.lemma ref="lem:lec20:antichain-le" status="доказано в лекции 20"}
В конечном ч.у.м. длина любой антицепи не больше числа частей любого разбиения на цепи.
:::

::: {.lemma ref="lem:lec20:min-max" status="доказано в лекции 20"}
В конечном ч.у.м. для любого $x$ есть минимальный $u \le x$ и максимальный $v \ge x$. *Идея:* иначе строится цепочка $x_0 < \dots < x_n$ из $n + 1$ различных элементов.
:::

::: {.theorem ref="thm:lec20:dilworth" status="доказано в лекции 20"}
Дилуорс: если $D$ — антицепь наибольшей длины в конечном ч.у.м., то оно разбивается на $|D|$ цепей. *Идея:* индукция по $|A|$; удаляем $m \le M$ (минимальный и максимальный); если наибольшая антицепь не укоротилась, режем по ней $A$ на $A^-$ и $A^+$ и склеиваем цепи через элементы $D$.
:::

::: {.corollary ref="cor:lec20:dilworth-minmax" status="доказано в лекции 20"}
Наибольшая длина антицепи = наименьшее число цепей в разбиении на цепи.
:::

::: {.corollary ref="cor:lec20:long-chain" status="доказано в лекции 20"}
Если $|A| > nm$, то в конечном ч.у.м. есть антицепь длины $n + 1$ или цепь длины $m + 1$.
:::

::: {.theorem ref="thm:lec20:erdos-szekeres" status="доказано в лекции 20"}
Эрдёш–Секереш: среди $nm + 1$ попарно различных чисел есть возрастающая подпоследовательность длины $m + 1$ или убывающая длины $n + 1$. *Идея:* порядок $(i, a_i) \prec (j, a_j) \iff i < j \wedge a_i < a_j$, цепи — возрастающие, антицепи — убывающие подпоследовательности.
:::

::: {.theorem ref="thm:lec20:mirsky" status="доказано в лекции 20"}
Мирский: наибольшая длина цепи конечного ч.у.м. = наименьшее число антицепей в разбиении на антицепи. *Идея:* $\min A$ — антицепь, пересекающая каждую самую длинную цепь; снимаем её и применяем индукцию.
:::

# Лекция 21 — Графы: основные понятия

::: {.definition ref="def:lec21:graph"}
Граф $G = (V, E)$: $V$ — конечное непустое множество вершин, $E \subseteq V^2$ — симметричное иррефлексивное отношение смежности.
:::

::: {.definition ref="def:lec21:edge"}
Ребро $xy = \{x, y\}$ — пара смежных вершин; порядок — $|V|$, размер — число рёбер ($= |E|/2$); $(n, m)$-граф — порядка $n$ и размера $m$.
:::

::: {.lemma ref="lem:lec21:nm" status="доказано в лекции 21"}
$(n, m)$-граф существует $\iff$ $m \le C_n^2$ ($n \ge 1$). *Идея:* рёбра — двухэлементные подмножества; пример — $K_n$ без $C_n^2 - m$ рёбер.
:::

::: {.definition ref="def:lec21:degree"}
$N_G(x) = \{y \mid xEy\}$ — окрестность, $d_G(x) = |N_G(x)|$ — степень, $0 \le d(x) \le n - 1$; степенная последовательность — степени по невозрастанию.
:::

::: {.lemma ref="lem:lec21:handshake" status="доказано в лекции 21"}
О рукопожатиях: $\sum_{v \in V} d(v) = 2m$. *Идея:* правило зависимого произведения для $E \subseteq V \times V$ с $E[\{v\}] = N(v)$.
:::

::: {.corollary ref="cor:lec21:odd" status="доказано в лекции 21"}
Число вершин нечётной степени чётно.
:::

::: {.definition ref="def:lec21:iso"}
Изоморфизм графов — биекция $\varphi\colon V \to V'$ с $xEy \iff \varphi(x) E' \varphi(y)$; $G \cong G'$.
:::

::: {.lemma ref="lem:lec21:iso-equiv" status="доказано в лекции 21"}
$\cong$ рефлексивно, симметрично и транзитивно (через $\mathrm{id}$, $\varphi^{-1}$, $\psi \circ \varphi$).
:::

::: {.lemma ref="lem:lec21:invariants" status="доказано в лекции 21"}
У изоморфных графов одинаковы порядок, размер и степенная последовательность. *Идея:* $N_H(\varphi(v)) = \varphi[N_G(v)]$.
:::

::: {.definition ref="def:lec21:subgraph"}
Подграф: $V' \subseteq V$, $E' \subseteq E$; порождённый множеством $V'$ подграф: $E' = E \cap (V' \times V')$.
:::

::: {.definition ref="def:lec21:complement"}
Дополнение $\overline{G} = (V, (V^2 \setminus \mathrm{id}_V) \setminus E)$; самодополнительный граф — $G \cong \overline{G}$.
:::

::: {.proposition ref="prop:lec21:complement-size" status="доказано в лекции 21"}
Дополнение $(n, m)$-графа — $(n, C_n^2 - m)$-граф.
:::

::: {.definition ref="def:lec21:path"}
Путь $v_1 \dots v_n$ — соседние вершины смежны; длина $n - 1$ (число рёбер); простой путь — без повторов вершин.
:::

::: {.lemma ref="lem:lec21:simple-path" status="доказано в лекции 21"}
Кратчайший путь из $x$ в $y$ прост. *Идея:* иначе выбрасываем кусок между двумя вхождениями одной вершины.
:::

::: {.definition ref="def:lec21:cycle"}
Цикл — путь $v_1 \dots v_n v_1$ ($n \ge 1$) с попарно различными рёбрами (в нём не меньше трёх рёбер); простой — без повторов вершин $v_1, \dots, v_n$.
:::

::: {.lemma ref="lem:lec21:conn-equiv" status="доказано в лекции 21"}
Соединённость путём $\sim_G$ — эквивалентность на $V$.
:::

::: {.definition ref="def:lec21:component"}
Компоненты связности — классы $\sim_G$; граф связен, если компонента одна.
:::

::: {.proposition ref="prop:lec21:iso-components" status="доказано в лекции 21"}
Изоморфизм переводит компоненты в компоненты; у изоморфных графов одинаковое число компонент.
:::

::: {.lemma ref="lem:lec21:edge-removal" status="доказано в лекции 21"}
Удаление ребра $xy$ связного графа: если $xy$ на цикле, граф остаётся связным; если нет, компонент ровно две — $[x]$ и $[y]$. *Идея:* объезд по остатку цикла; во втором случае кратчайший путь до ближайшей из $x$, $y$ не проходит по $xy$, а общая компонента дала бы цикл.
:::

::: {.corollary ref="cor:lec21:components-removal" status="доказано в лекции 21"}
Удаление ребра на цикле сохраняет число компонент $k$, удаление моста даёт $k + 1$.
:::

::: {.lemma ref="lem:lec21:connected-edges" status="доказано в лекции 21"}
В связном $(n, m)$-графе $m \ge n - 1$. *Идея:* индукция по $m$ с удалением ребра.
:::

::: {.definition ref="def:lec21:min-connected"}
Минимально связный граф — связный, теряющий связность при удалении любого ребра.
:::

::: {.lemma ref="lem:lec21:min-connected-edges" status="доказано в лекции 21"}
В минимально связном $(n, m)$-графе $m = n - 1$. *Идея:* удаление ребра даёт две минимально связные компоненты, к ним — индукция.
:::

# Лекция 22 — Деревья. Двудольные графы и раскраски

::: {.definition ref="def:lec22:tree"}
Дерево — связный ацикличный граф; лес — ацикличный граф (его компоненты — деревья).
:::

::: {.theorem ref="thm:lec22:tree-equiv" status="доказано в лекции 22"}
Для $(n, m)$-графа равносильны: дерево; минимально связен; связен и $m = n - 1$; любые две вершины соединены единственным простым путём. *Идея:* леммы об удалении ребра и о числе рёбер; два различных простых пути склеиваются в простой цикл.
:::

::: {.corollary ref="cor:lec22:forest" status="доказано в лекции 22"}
В лесу с $n$ вершинами и $k$ компонентами $n - k$ рёбер; граф — дерево $\iff$ ацикличен и $m = n - 1$.
:::

::: {.proposition ref="prop:lec22:leaves" status="доказано в лекции 22"}
В дереве с $n \ge 2$ вершинами не меньше двух листьев; удаление листа оставляет дерево. *Идея:* концы самого длинного простого пути.
:::

::: {.definition ref="def:lec22:spanning-tree"}
Остовное дерево графа $G = (V, E)$ — дерево $(V, E')$ с $E' \subseteq E$.
:::

::: {.theorem ref="thm:lec22:spanning" status="доказано в лекции 22"}
У каждого связного графа есть остовное дерево. *Идея:* удаляем рёбра, лежащие на циклах (индукция по $m$).
:::

::: {.definition ref="def:lec22:bipartite"}
Двудольный граф — вершины разбиваются на две непустые доли без рёбер внутри долей; $k$-дольный — на $k$ долей; $K_{a, b}$ — полный двудольный граф.
:::

::: {.definition ref="def:lec22:coloring"}
Раскраска в $k$ цветов — $c\colon V \to \mathbf{k}$ с $c(x) \ne c(y)$ для смежных $x$, $y$.
:::

::: {.definition ref="def:lec22:distance"}
Расстояние $d(x, y)$ между вершинами одной компоненты — длина кратчайшего пути из $x$ в $y$.
:::

::: {.theorem ref="thm:lec22:bipartite-criterion" status="доказано в лекции 22"}
Граф с $|V| \ge 2$ двудолен $\iff$ нет циклов нечётной длины $\iff$ нет простых циклов нечётной длины. *Идея:* доли — чётность расстояния до фиксированной вершины; смежные вершины одной чётности дают простой нечётный цикл.
:::

::: {.proposition ref="prop:lec22:two-colorings" status="доказано в лекции 22"}
У графа с $k$ компонентами, раскрашиваемого в два цвета, ровно $2^k$ таких раскрасок; у дерева — две. *Идея:* в связном графе цвет одной вершины определяет все.
:::

::: {.lemma ref="lem:lec22:bipartite-handshake" status="доказано в лекции 22"}
В двудольном $(n, m)$-графе с долями $V_1$, $V_2$: $\sum_{v \in V_1} d(v) = \sum_{v \in V_2} d(v) = m$.
:::

# Глоссарий курса

::: course-glossary
:::
