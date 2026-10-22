---
course: calculus
title: "Теория: математический анализ"
---

# Соглашения курса

Здесь только то, что в курсе принято иначе, чем в других книгах и курсах, или обозначается по-своему. Ловушки и корнер-кейсы — в замечаниях лекций.

- $\N = \{1, 2, 3, \dots\}$, $0 \notin \N$: последовательности начинаются с $a_1$, индукция — с $P(1)$ [-@rem:lec01:naturals]. В дискретной математике соглашение обратное.
- Число сочетаний $C_n^k$: $n$ снизу, $k$ сверху (в англоязычной литературе $\binom{n}{k}$, $n$ сверху) [-@rem:lec02:notation]; сочетания с повторениями — $\overline{C}_n^k = C_{n+k-1}^k$ ($n$ видов снизу), в задачах встречается запись $\overline{C_k^n}$ с $n$ сверху [-@rem:lec02:repetitions-notation].
- «Возрастающая» последовательность — строго ($a_n < a_{n+1}$), нестрогая — «неубывающая» [-@rem:lec02:increasing-convention].
- Ограниченность последовательности сверху определяется строгим неравенством $a_n < C$ [-@rem:lec02:strict], ограниченность множества — нестрогим $a \le C$ [-@rem:lec05:nonstrict]; на сами понятия это не влияет.
- Бесконечно большая — это стремление к $\infty$ без знака: $(-1)^n n \to \infty$, но не к $\pm\infty$ [-@rem:lec04:infinity-symbol].

# Лекция 1 — Высказывания, предикаты, кванторы. Метод математической индукции. Неравенство Бернулли

::: {.definition ref="def:lec01:statement"}
Высказывание — утверждение, про которое можно сказать, истинно оно или ложно.
:::

::: {.definition ref="def:lec01:predicate"}
Предикат — утверждение, зависящее от переменных, которое становится высказыванием при любых значениях переменных.
:::

::: {.definition ref="def:lec01:quantifiers"}
$\forall x \in X\ P(x)$ истинно, если $P(x)$ истинно при каждом $x \in X$; $\exists x \in X\ P(x)$ истинно, если $P(x)$ истинно хотя бы при одном $x \in X$.
:::

::: {.proposition ref="prop:lec01:order" status="доказано в лекции 1"}
Одноимённые кванторы перестановочны; $\exists y\, \forall x\ P \Rightarrow \forall x\, \exists y\ P$; обратное неверно. *Идея:* одно $y_0$ из левой части годится для всех $x$; контрпример к обратному — предикат $y \ge x^2$: $\forall x\, \exists y$ истинно, $\exists y\, \forall x$ ложно.
:::

::: {.definition ref="def:lec01:operations"}
$A \wedge B$ истинна, когда истинны обе; $A \vee B$ — когда истинна хотя бы одна; $\lnot A$ — когда $A$ ложно; $A \Rightarrow B$ ложна только при истинной $A$ и ложной $B$; $A \Leftrightarrow B$ — это $(A \Rightarrow B) \wedge (B \Rightarrow A)$.
:::

::: {.definition ref="def:lec01:tautology"}
Тавтология — формула, истинная при всех наборах значений входящих в неё высказываний; формулы равносильны, если их значения совпадают при каждом наборе.
:::

::: {.proposition ref="prop:lec01:laws" status="доказано в лекции 1"}
Равносильны: $\lnot\lnot A$ и $A$; $\lnot(A \wedge B)$ и $\lnot A \vee \lnot B$; $\lnot(A \vee B)$ и $\lnot A \wedge \lnot B$; $A \Rightarrow B$ и $\lnot A \vee B$; $\lnot(A \Rightarrow B)$ и $A \wedge \lnot B$; $A \Rightarrow B$ и $\lnot B \Rightarrow \lnot A$. *Идея:* таблицы истинности.
:::

::: {.theorem ref="thm:lec01:negation" status="доказано в лекции 1"}
$\lnot \forall x \in X\ P(x) \Leftrightarrow \exists x \in X\ \lnot P(x)$, $\lnot \exists x \in X\ P(x) \Leftrightarrow \forall x \in X\ \lnot P(x)$; для цепочки кванторов $\lnot$ проносится слева направо, ограничения $x \in X$ сохраняются. *Идея:* $\forall$-высказывание ложно ровно тогда, когда есть контрпример.
:::

::: {.axiom ref="ax:lec01:induction"}
Если $P(1)$ и $\forall k \in \N\ (P(k) \Rightarrow P(k+1))$, то $\forall n \in \N\ P(n)$.
:::

::: {.proposition ref="prop:lec01:sum" status="доказано в лекции 1"}
$1 + 2 + \dots + n = \frac{n(n+1)}{2}$. *Идея:* индукция, $\frac{k(k+1)}{2} + (k + 1) = \frac{(k+1)(k+2)}{2}$.
:::

::: {.proposition ref="prop:lec01:induction-n0" status="доказано в лекции 1"}
Если $P(n_0)$ и $\forall k \ge n_0\ (P(k) \Rightarrow P(k+1))$, то $P(n)$ при всех $n \ge n_0$. *Идея:* обычная индукция для $Q(m) = P(m + n_0 - 1)$.
:::

::: {.proposition ref="prop:lec01:induction-two" status="доказано в лекции 1"}
Если $P(1)$, $P(2)$ и $\forall k\ (P(k) \wedge P(k+1) \Rightarrow P(k+2))$, то $\forall n\ P(n)$. *Идея:* обычная индукция для $Q(n) = P(n) \wedge P(n+1)$.
:::

::: {.theorem ref="thm:lec01:bernoulli" status="доказано в лекции 1"}
$\forall n \in \N\ \forall x \ge -1\colon (1 + x)^n \ge 1 + nx$. *Идея:* индукция по $n$; в переходе домножаем на $1 + x \ge 0$ и отбрасываем $kx^2 \ge 0$.
:::

# Лекция 2 — Комбинаторика и бином Ньютона. Последовательности, монотонность, ограниченность

::: {.definition ref="def:lec02:permutation"}
Перестановка $n$-элементного множества — упорядоченный набор всех его элементов; их число $P_n$.
:::

::: {.proposition ref="prop:lec02:permutations" status="доказано в лекции 2"}
$P_n = n!$. *Идея:* правило произведения: $n$ вариантов на первое место, $n - 1$ на второе, …
:::

::: {.definition ref="def:lec02:arrangement"}
Размещение из $n$ по $k$ ($0 \le k \le n$) — упорядоченный набор $k$ различных элементов $n$-элементного множества; их число $A_n^k$.
:::

::: {.proposition ref="prop:lec02:arrangements" status="доказано в лекции 2"}
$A_n^k = n(n-1)\cdots(n-k+1) = \frac{n!}{(n-k)!}$; $0! = 1$. *Идея:* правило произведения для $k$ мест.
:::

::: {.definition ref="def:lec02:combination"}
Сочетание из $n$ по $k$ ($0 \le k \le n$) — $k$-элементное подмножество $n$-элементного множества; их число $C_n^k$.
:::

::: {.proposition ref="prop:lec02:combinations" status="доказано в лекции 2"}
$C_n^k = \frac{A_n^k}{k!} = \frac{n!}{k!(n-k)!}$. *Идея:* каждое сочетание соответствует ровно $k!$ размещениям.
:::

::: {.proposition ref="prop:lec02:pascal" status="доказано в лекции 2"}
$C_n^k = C_n^{n-k}$; $C_n^k = C_{n-1}^k + C_{n-1}^{k-1}$ при $1 \le k \le n - 1$. *Идея:* подмножество ↔ дополнение; разбиение подмножеств по тому, содержат ли они фиксированный элемент.
:::

::: {.proposition ref="prop:lec02:repetitions" status="доказано в лекции 2"}
$\overline{A}_n^k = n^k$; $P(n; m_1, \dots, m_s) = \frac{n!}{m_1! \cdots m_s!}$; $\overline{C}_n^k = C_{n+k-1}^k$. *Идея:* правило произведения; деление на перестановки одинаковых букв; кодирование звёздочками и перегородками.
:::

::: {.theorem ref="thm:lec02:binomial" status="доказано в лекции 2"}
$(a + b)^n = \sum_{k=0}^{n} C_n^k a^k b^{n-k}$ (здесь $0^0 = 1$). *Идея:* при раскрытии $n$ скобок одночлен $a^k b^{n-k}$ получается столько раз, сколькими способами можно выбрать $k$ скобок, из которых берётся $a$.
:::

::: {.corollary ref="cor:lec02:sum" status="доказано в лекции 2"}
$\sum_{k=0}^{n} C_n^k = 2^n$, $\sum_{k=0}^{n} (-1)^k C_n^k = 0$. *Идея:* $a = b = 1$ и $a = -1$, $b = 1$ в формуле бинома.
:::

::: {.theorem ref="thm:lec02:multinomial" status="доказано в лекции 2"}
$(x_1 + \dots + x_s)^n = \sum_{m_1 + \dots + m_s = n} P(n; m_1, \dots, m_s) x_1^{m_1} \cdots x_s^{m_s}$. *Идея:* как у бинома — число слов из $m_1$ букв $x_1$, …, $m_s$ букв $x_s$.
:::

::: {.definition ref="def:lec02:sequence"}
Последовательность $(a_n)_{n \in \N}$ — набор вещественных чисел, пронумерованных натуральными индексами (функция $\N \to \R$).
:::

::: {.definition ref="def:lec02:monotone"}
Возрастающая: $a_n < a_{n+1}$; убывающая: $a_n > a_{n+1}$; неубывающая: $a_n \le a_{n+1}$; невозрастающая: $a_n \ge a_{n+1}$ (при всех $n \in \N$); монотонная — любого из этих типов.
:::

::: {.definition ref="def:lec02:bounded-above"}
Ограниченная сверху: $\exists C \in \R\ \forall n \in \N\colon a_n < C$; снизу: $\exists C \in \R\ \forall n\colon a_n > C$; ограниченная — и сверху, и снизу.
:::

::: {.proposition ref="prop:lec02:bounded-abs" status="доказано в лекции 2"}
$(a_n)$ ограничена $\Leftrightarrow \exists C > 0\ \forall n\colon |a_n| < C$. *Идея:* «$\Leftarrow$»: $-C < a_n < C$; «$\Rightarrow$»: $C = |C_1| + |C_2|$.
:::

# Лекция 3 — Предел последовательности. Единственность предела, ограниченность сходящейся последовательности, предел суммы

::: {.definition ref="def:lec03:neighborhood"}
$\varepsilon$-окрестность точки $a$: $U_\varepsilon(a) = (a - \varepsilon, a + \varepsilon)$, $\varepsilon > 0$.
:::

::: {.definition ref="def:lec03:limit"}
$\lim\limits_{n \to \infty} a_n = a \in \R$, если $\forall \varepsilon > 0\ \exists N = N(\varepsilon) \in \N\ \forall n > N\colon |a_n - a| < \varepsilon$. 
:::

::: {.definition ref="def:lec03:convergent"}
Сходящаяся — имеет предел-число; расходящаяся — не имеет: $\forall a\ \exists \varepsilon > 0\ \forall N\ \exists n > N\colon |a_n - a| \ge \varepsilon$.
:::

::: {.proposition ref="prop:lec03:finitely-many" status="доказательство — на семинаре"}
$a_n \to a \Leftrightarrow$ для любого $\varepsilon > 0$ вне $U_\varepsilon(a)$ лишь конечное число членов (номеров). *Идея:* номера вне окрестности не больше $N(\varepsilon)$; обратно, $N$ — наибольший из них.
:::

::: {.proposition ref="prop:lec03:finite-change" status="доказательство — на семинаре"}
Изменение конечного числа членов и сдвиг номера $b_n = a_{n \pm p}$ не меняют сходимости и предела. *Идея:* $N_b = \max(N_a, n_0)$ или $\max(N_a + p, n_0)$.
:::

::: {.theorem ref="thm:lec03:uniqueness" status="доказано в лекции 3"}
Если $a_n \to a$ и $a_n \to b$, то $a = b$. *Идея:* от противного; окрестности радиуса $\frac{|b - a|}{3}$ не пересекаются, а член с номером $n > \max(N_1, N_2)$ лежит в обеих.
:::

::: {.theorem ref="thm:lec03:bounded" status="доказано в лекции 3"}
Сходящаяся последовательность ограничена. *Идея:* $\varepsilon = 2$; $m = \min(a_1, \dots, a_N, a - 2)$, $M = \max(a_1, \dots, a_N, a + 2)$, $m \le a_n \le M$.
:::

::: {.corollary ref="cor:lec03:unbounded" status="доказано в лекции 3"}
Неограниченная последовательность расходится. Обратное неверно: $(-1)^n$ ограничена и расходится.
:::

::: {.proposition ref="prop:lec03:triangle" status="доказано в лекции 3"}
Неравенство треугольника: $|x + y| \le |x| + |y|$; равносильная форма $|u - v| \le |u - w| + |w - v|$.
:::

::: {.theorem ref="thm:lec03:sum" status="доказано в лекции 3"}
Арифметика предела: если $a_n \to a$, $b_n \to b$, то (1) $a_n \pm b_n \to a \pm b$; (2) $a_n b_n \to ab$; (3) $\frac{a_n}{b_n} \to \frac ab$ при $b_n \ne 0$, $b \ne 0$. Пункт 1 доказан в лекции 3, пункты 2–3 — в лекции 4. *Идея* (1): $|(a_n + b_n) - (a + b)| \le |a_n - a| + |b_n - b|$, номера для $\frac\varepsilon2$, $N = \max(N_1, N_2)$.
:::

# Лекция 4 — Бесконечно малые и бесконечно большие последовательности. Арифметика предела. Предельный переход в неравенствах. Теорема о двух милиционерах

::: {.definition ref="def:lec04:infinite-limit"}
$\lim a_n = \infty$: $\forall M > 0\ \exists N = N(M)\ \forall n > N\colon |a_n| > M$; $\lim a_n = +\infty$: то же с $a_n > M$; $\lim a_n = -\infty$: с $a_n < -M$.
:::

::: {.definition ref="def:lec04:small-large"}
Бесконечно малая (б.м.): $a_n \to 0$; бесконечно большая (б.б.): $a_n \to \infty$ (без знака).
:::

::: {.proposition ref="prop:lec04:reciprocal" status="доказано в лекции 4"}
$\frac{1}{\text{б.б.}}$ — б.м.; $\frac{1}{\text{б.м.}}$ — б.б. (при $a_n \ne 0$). *Идея:* $\left|\frac{1}{a_n}\right| < \varepsilon \Leftrightarrow |a_n| > \frac1\varepsilon$; номер $N\left(\frac1\varepsilon\right)$.
:::

::: {.proposition ref="prop:lec04:bounded-small" status="доказано в лекции 4"}
Ограниченная, умноженная на б.м., — б.м. *Идея:* $|a_n b_n| \le C|b_n|$, номер $N\left(\frac\varepsilon C\right)$.
:::

::: {.corollary ref="cor:lec04:small-algebra" status="доказано в лекции 4"}
Сумма, разность, произведение б.м. и произведение б.м. на число — б.м.; б.м. ограничена.
:::

::: {.lemma ref="lem:lec04:decomposition" status="доказано в лекции 4"}
$a_n \to a \Leftrightarrow a_n = a + \alpha_n$, где $\alpha_n$ — б.м.
:::

::: {.theorem ref="thm:lec04:product" status="доказано в лекции 4"}
Если $a_n \to a$, $b_n \to b$, то $a_n b_n \to ab$. *Идея:* $a_n b_n - ab = a\beta_n + b\alpha_n + \alpha_n\beta_n$ — сумма б.м.
:::

::: {.definition ref="def:lec04:separated"}
$(d_n)$ отделима от нуля: $\exists \delta > 0\ \forall n \in \N\colon |d_n| > \delta$.
:::

::: {.proposition ref="prop:lec04:separated" status="доказано в лекции 4"}
Если $a_n \to a \ne 0$ и $a_n \ne 0$ при всех $n$, то $(a_n)$ отделима от нуля. *Идея:* $\varepsilon_0 = \frac{|a|}{2}$, $\delta = \frac12\min\left(|a_1|, \dots, |a_N|, \frac{|a|}{2}\right)$.
:::

::: {.proposition ref="prop:lec04:reciprocal-bounded" status="доказано в лекции 4"}
$\frac{1}{\text{отделимая}}$ — ограниченная ($C = \frac1\delta$); $\frac{1}{\text{ограниченная}}$ — отделимая (при $c_n \ne 0$, $\delta = \frac1C$).
:::

::: {.theorem ref="thm:lec04:quotient" status="доказано в лекции 4"}
Если $a_n \to a$, $b_n \to b \ne 0$, $b_n \ne 0$, то $\frac{a_n}{b_n} \to \frac ab$. *Идея:* $\frac{a_n}{b_n} - \frac ab = \frac1b \cdot \frac{1}{b_n} \cdot (b\alpha_n - a\beta_n)$ — ограниченная · б.м.; $\frac{1}{b_n}$ ограничена, так как $b_n$ отделима от нуля.
:::

::: {.theorem ref="thm:lec04:inequality" status="доказано в лекции 4"}
Если $a_n \to a$, $b_n \to b$ и $a_n \ge b_n$ при $n > N$, то $a \ge b$. Из строгого неравенства следует только нестрогое ($\frac1n > 0$). *Идея:* от противного, $\varepsilon_0 = \frac{b - a}{3}$, непересекающиеся окрестности дают $a_n < b_n$.
:::

::: {.corollary ref="cor:lec04:bound-limit" status="доказано в лекции 4"}
Если $a_n \to a$ и $a_n \le C$ (соответственно $\ge C$) с некоторого номера, то $a \le C$ (соответственно $a \ge C$).
:::

::: {.theorem ref="thm:lec04:squeeze" status="доказано в лекции 4"}
Теорема о двух милиционерах: если $a_n \le b_n \le c_n$ при $n > N$ и $a_n \to a$, $c_n \to a$, то $b_n \to a$. *Идея:* $a - \varepsilon < a_n \le b_n \le c_n < a + \varepsilon$ при $n > \max(N, N_1, N_2)$.
:::

::: {.definition ref="def:lec04:indeterminate"}
Неопределённость — частное, произведение, сумма или разность б.м. и/или б.б., предел которых не определён типами частей: $\frac00$, $\frac\infty\infty$, $\infty - \infty$, $0 \cdot \infty$.
:::

::: {.proposition ref="prop:lec04:standard" status="доказано в лекции 4"}
$q^n \to 0$ ($|q| < 1$), $\to +\infty$ ($q > 1$), $\to \infty$ ($q < -1$), $= 1$ ($q = 1$); $\sqrt[n]{a} \to 1$ ($a > 0$); $\sqrt[n]{n} \to 1$; $\frac{n^k}{a^n} \to 0$ ($a > 1$); $\frac{a^n}{n!} \to 0$; $\frac{n!}{n^n} \to 0$. *Идея:* Бернулли или один член бинома + теорема о двух милиционерах; для $\frac{a^n}{n!}$ — множители $\frac{|a|}{j} \le \frac12$ при $j > 2|a|$.
:::

# Лекция 5 — Аксиома непрерывности. Точные грани. Теорема Вейерштрасса. Число e. Подпоследовательности

::: {.axiom ref="ax:lec05:continuity"}
Если $A, B \subseteq \R$ непусты и $a \le b$ для всех $a \in A$, $b \in B$, то $\exists c \in \R$: $a \le c \le b$ для всех $a \in A$, $b \in B$.
:::

::: {.definition ref="def:lec05:bounded-set"}
$A \subseteq \R$ ограничено сверху: $\exists C \in \R\ \forall a \in A\colon a \le C$ (нестрого); снизу: $a \ge C$; ограничено — и сверху, и снизу.
:::

::: {.definition ref="def:lec05:upper-bound"}
Верхняя грань множества $A$ — число $c$ с $c \ge a$ для всех $a \in A$.
:::

::: {.definition ref="def:lec05:sup"}
$\sup A$ (точная верхняя грань, супремум) — наименьшая из верхних граней ограниченного сверху множества $A$.
:::

::: {.proposition ref="prop:lec05:max" status="доказано в лекции 5"}
Если существует $\max A$, то $\sup A = \max A$.
:::

::: {.theorem ref="thm:lec05:sup-exists" status="доказано в лекции 5"}
Непустое ограниченное сверху $A \subseteq \R$ имеет $\sup A$. *Идея:* аксиома непрерывности для $A$ и множества $B$ всех его верхних граней; разделяющее $c$ — верхняя грань, не большая любой другой.
:::

::: {.definition ref="def:lec05:inf"}
Нижняя грань: $c \le a$ для всех $a \in A$; $\inf A$ (инфимум) — наибольшая из нижних граней.
:::

::: {.corollary ref="cor:lec05:inf-exists" status="доказано в лекции 5"}
Непустое ограниченное снизу множество имеет $\inf A = -\sup(-A)$.
:::

::: {.proposition ref="prop:lec05:sup-eps" status="доказано в лекции 5"}
$s = \sup A$ ($A \ne \varnothing$) $\Leftrightarrow$ (1) $a \le s$ для всех $a \in A$; (2) $\forall \varepsilon > 0\ \exists a \in A\colon a > s - \varepsilon$. Для $\inf$ — симметрично. *Идея:* $s - \varepsilon$ не может быть верхней гранью; обратно, верхняя грань $c < s$ противоречит (2) при $\varepsilon = s - c$.
:::

::: {.theorem ref="thm:lec05:weierstrass" status="доказано в лекции 5"}
Теорема Вейерштрасса: неубывающая ограниченная сверху последовательность сходится, и $\lim a_n = \sup a_n$. *Идея:* если $a_N > \sup - \varepsilon$, то по монотонности это верно при всех $n > N$; если такого $N$ нет, то $\sup - \varepsilon$ — верхняя грань меньше супремума.
:::

::: {.corollary ref="cor:lec05:weierstrass-dec" status="доказано в лекции 5"}
Невозрастающая ограниченная снизу последовательность сходится к $\inf a_n$.
:::

::: {.proposition ref="prop:lec05:monotone-infinite" status="доказано в лекции 5"}
Неубывающая неограниченная сверху последовательность стремится к $+\infty$; невозрастающая неограниченная снизу — к $-\infty$.
:::

::: {.theorem ref="thm:lec05:e" status="доказано в лекции 5"}
$\left(1 + \frac1n\right)^n$ сходится. *Идея:* возрастает — отношение соседних членов $\frac{n+2}{n+1}\left(1 - \frac{1}{(n+1)^2}\right)^n > 1$ по Бернулли; ограничена числом $3$ — бином и телескопическая сумма; дальше теорема Вейерштрасса.
:::

::: {.definition ref="def:lec05:e"}
$e = \lim\limits_{n \to \infty} \left(1 + \frac1n\right)^n \approx 2{,}718$.
:::

::: {.definition ref="def:lec05:subsequence"}
Подпоследовательность $(a_n)$ — последовательность $b_k = a_{n_k}$, где $n_1 < n_2 < n_3 < \dots$
:::

::: {.lemma ref="lem:lec05:nk" status="доказано в лекции 5"}
$n_k \ge k$ при всех $k$ (индукция).
:::

::: {.proposition ref="prop:lec05:subseq-limit" status="доказано в лекции 5"}
Если $a_n \to a$, то $a_{n_k} \to a$ (так же для $\pm\infty$). *Идея:* $K = N$, так как $n_k \ge k$.
:::

::: {.corollary ref="cor:lec05:divergence" status="доказано в лекции 5"}
Расходящаяся подпоследовательность или две подпоследовательности с разными пределами означают расходимость $(a_n)$.
:::

::: {.proposition ref="prop:lec05:e-power" status="доказано в лекции 5"}
$\left(1 + \frac kn\right)^n \to e^k$, $\left(1 - \frac kn\right)^n \to e^{-k}$, $k \in \N$. *Идея:* $1 + \frac kn = \prod_{j=0}^{k-1}\left(1 + \frac{1}{n+j}\right)$; для второго — $1 - \frac kn = 1 \Big/ \left(1 + \frac{k}{n - k}\right)$ и сдвиг номера на $k$.
:::

::: {.proposition ref="prop:lec05:root" status="доказано в лекции 5"}
Если $y_n \ge 0$, $y_n \to y$, то $\sqrt[k]{y_n} \to \sqrt[k]{y}$. *Идея:* $\left|\sqrt[k]{y_n} - \sqrt[k]{y}\right| \le \frac{|y_n - y|}{(\sqrt[k]{y})^{k-1}}$ при $y > 0$.
:::

# Лекция 6 — Теорема Больцано–Вейерштрасса. Критерий Коши. Частичные пределы и предельные точки. Верхний и нижний пределы

::: {.theorem ref="thm:lec06:bw" status="доказано в лекции 6"}
Теорема Больцано–Вейерштрасса: у ограниченной последовательности есть сходящаяся подпоследовательность. *Идея:* деление пополам с сохранением половины, где бесконечно много членов; концы вложенных отрезков сходятся к общему пределу по теореме Вейерштрасса; выбранные члены зажаты между концами.
:::

::: {.proposition ref="prop:lec06:unbounded-subseq" status="доказано в лекции 6"}
Неограниченная сверху (снизу) последовательность имеет подпоследовательность, стремящуюся к $+\infty$ ($-\infty$).
:::

::: {.corollary ref="cor:lec06:any-subseq" status="доказано в лекции 6"}
У любой последовательности есть подпоследовательность с конечным пределом или пределом $\pm\infty$.
:::

::: {.definition ref="def:lec06:fundamental"}
Фундаментальная последовательность (последовательность Коши): $\forall \varepsilon > 0\ \exists N = N(\varepsilon)\ \forall m, n > N\colon |a_m - a_n| < \varepsilon$.
:::

::: {.lemma ref="lem:lec06:fundamental-bounded" status="доказано в лекции 6"}
Фундаментальная последовательность ограничена. *Идея:* $\varepsilon = 1$, $m = N + 1$; границы $\min(a_1, \dots, a_N, a_{N+1} - 1)$ и $\max(a_1, \dots, a_N, a_{N+1} + 1)$.
:::

::: {.theorem ref="thm:lec06:cauchy" status="доказано в лекции 6"}
Критерий Коши: последовательность сходится $\Leftrightarrow$ она фундаментальна. *Идея:* «$\Rightarrow$» — $\frac\varepsilon2$ и неравенство треугольника; «$\Leftarrow$» — ограниченность, Больцано–Вейерштрасс даёт $a_{n_k} \to a$, затем $|a_n - a| \le |a_n - a_{n_k}| + |a_{n_k} - a|$.
:::

::: {.definition ref="def:lec06:partial-limit"}
Частичный предел — предел (конечный или $\pm\infty$) какой-либо подпоследовательности.
:::

::: {.definition ref="def:lec06:limit-point"}
Предельная точка — число $a$, в любой окрестности $U_\varepsilon(a)$ которого лежит бесконечно много членов (бесконечно много номеров $n$).
:::

::: {.theorem ref="thm:lec06:partial-limit-point" status="доказано в лекции 6"}
Число $a$ — частичный предел $\Leftrightarrow$ $a$ — предельная точка. *Идея:* «$\Leftarrow$» — из $U_{1/k}(a)$ выбираем $a_{n_k}$ с $n_k > n_{k-1}$, затем теорема о двух милиционерах.
:::

::: {.proposition ref="prop:lec06:split" status="доказано в лекции 6"}
Если номера разбиты на конечное число бесконечных частей и подпоследовательность $j$-й части стремится к $L_j$, то частичные пределы — ровно $L_1, \dots, L_p$. *Идея:* у сходящейся подпоследовательности бесконечно много номеров в одной части; единственность предела.
:::

::: {.definition ref="def:lec06:limsup"}
$\varlimsup\limits_{n \to \infty} a_n$ — наибольший, $\varliminf\limits_{n \to \infty} a_n$ — наименьший из частичных пределов ($-\infty <$ числа $< +\infty$).
:::

::: {.theorem ref="thm:lec06:limsup-exists" status="без доказательства"}
Верхний и нижний пределы существуют у любой последовательности (возможно, $\pm\infty$).
:::

::: {.proposition ref="prop:lec06:limsup-sup" status="доказано в лекции 6"}
Для ограниченной последовательности $\inf a_n \le \varliminf a_n \le \varlimsup a_n \le \sup a_n$.
:::

# Лекция 7 — Предел функции по Коши и по Гейне. Арифметика предела, предельный переход в неравенствах, сложная функция

::: {.definition ref="def:lec07:function"}
Функция $f\colon X \to Y$ ($X, Y \subseteq \R$) сопоставляет каждому $x \in X$ ровно одно $f(x) \in Y$; $D_f = X$ — область определения, $E_f = f(X)$ — множество значений ($Y$ может быть больше $E_f$).
:::

::: {.definition ref="def:lec07:punctured"}
Проколотая окрестность $\mathring{U}_\delta(x_0) = (x_0 - \delta; x_0) \cup (x_0; x_0 + \delta)$, то есть $0 < |x - x_0| < \delta$.
:::

::: {.definition ref="def:lec07:cauchy-limit"}
Предел по Коши ($f$ определена в $\mathring{U}_r(x_0)$): $\lim\limits_{x \to x_0} f(x) = A$, если $\forall \varepsilon > 0\ \exists \delta = \delta(\varepsilon) > 0\ \forall x \in \mathring{U}_\delta(x_0)\colon |f(x) - A| < \varepsilon$.
:::

::: {.definition ref="def:lec07:heine-limit"}
Предел по Гейне ($f$ определена в $\mathring{U}_r(x_0)$): $f(x_n) \to A$ для любой последовательности Гейне — $x_n \in D_f$, $x_n \ne x_0$, $x_n \to x_0$.
:::

::: {.theorem ref="thm:lec07:cauchy-heine" status="доказано в лекции 7"}
Определения по Коши и по Гейне равносильны. *Идея:* «$\Rightarrow$» — номер $N(\delta(\varepsilon))$; «$\Leftarrow$» — от противного: в $\mathring{U}_{1/k}(x_0)$ берём $x_k$ с $|f(x_k) - A| \ge \varepsilon_0$, по теореме о двух милиционерах $x_k \to x_0$, противоречие с определением Гейне.
:::

::: {.corollary ref="cor:lec07:uniqueness" status="доказано в лекции 7"}
Предел функции в точке единствен. *Идея:* одна последовательность Гейне и единственность предела последовательности.
:::

::: {.theorem ref="thm:lec07:arithmetic" status="доказано в лекции 7"}
Если $f \to A$, $g \to B$ при $x \to x_0$, то $f \pm g \to A \pm B$, $fg \to AB$, а при $B \ne 0$ и $g \ne 0$ в некоторой $\mathring{U}_{\delta_0}(x_0)$ — $\frac fg \to \frac AB$. *Идея:* по Гейне сводится к арифметике последовательностей.
:::

::: {.theorem ref="thm:lec07:inequalities" status="доказано в лекции 7"}
Если $f \ge g$ в $\mathring{U}_{\delta_0}(x_0)$, $f \to A$, $g \to B$, то $A \ge B$. Если $f \le g \le h$ в $\mathring{U}_{\delta_0}(x_0)$ и $f, h \to A$, то $g \to A$ (о двух милиционерах). *Идея:* по Гейне; члены последовательности Гейне попадают в $\mathring{U}_{\delta_0}(x_0)$ с некоторого номера.
:::

::: {.theorem ref="thm:lec07:composite" status="доказано в лекции 8"}
Если $f(x) \to A$ при $x \to x_0$, $g(y) \to B$ при $y \to A$ и либо $g(A) = B$, либо $f(x) \ne A$ в некоторой $\mathring{U}_{\delta_0}(x_0)$, то $g(f(x)) \to B$. Без условий неверно: $f \equiv 0$, $g(y) = |\operatorname{sign} y|$. *Идея:* цепочка $\varepsilon \to \eta \to \delta$; точки с $f(x) = A$ либо исключены условием 2, либо дают $g(A) = B$ по условию 1.
:::

::: {.corollary ref="cor:lec07:two-sequences" status="доказано в лекции 7"}
Если на двух последовательностях Гейне значения $f$ стремятся к разным числам или на одной расходятся, то предела в точке $x_0$ нет.
:::

# Лекция 8 — Сложная функция и первый замечательный предел. Локальные свойства предела. Односторонние и бесконечные пределы

::: {.lemma ref="lem:lec08:sin-estimate" status="доказано в лекции 8"}
$\sin x < x < \operatorname{tg} x$ при $0 < x < \frac\pi2$; $|\sin x| \le |x|$ при всех $x$. *Идея:* площади треугольника $OBC$, сектора и треугольника $OAC$ на единичной окружности.
:::

::: {.proposition ref="prop:lec08:sin-cos" status="доказано в лекции 8"}
$\lim\limits_{x \to x_0} \sin x = \sin x_0$, $\lim\limits_{x \to x_0} \cos x = \cos x_0$ для любого $x_0$. *Идея:* формулы разности синусов и косинусов и $|\sin t| \le |t|$ дают $|\sin x - \sin x_0| \le |x - x_0|$, то есть $\delta = \varepsilon$.
:::

::: {.theorem ref="thm:lec08:first-remarkable" status="доказано в лекции 8"}
$\lim\limits_{x \to 0} \dfrac{\sin x}{x} = 1$ (угол в радианах). *Идея:* $\cos x < \frac{\sin x}{x} < 1$ в $\mathring{U}_{\pi/2}(0)$ (лемма, деление на $\sin x$, чётность), $\cos x \to 1$, теорема о двух милиционерах.
:::

::: {.corollary ref="cor:lec08:consequences" status="доказано в лекции 8"}
$\frac{\sin kx}{x} \to k$, $\frac{\operatorname{tg} x}{x} \to 1$, $\frac{1 - \cos x}{x^2} \to \frac12$ при $x \to 0$. *Идея:* замена $y = kx$ (условие 2 теоремы о сложной функции), $1 - \cos x = 2\sin^2\frac x2$.
:::

::: {.definition ref="def:lec08:local"}
$f$ ограничена в окрестности $x_0$: $\exists C > 0\ \exists \delta > 0\ \forall x \in \mathring{U}_\delta(x_0)\colon |f(x)| < C$. Отделима от нуля в окрестности $x_0$: $\exists c > 0\ \exists \delta > 0\ \forall x \in \mathring{U}_\delta(x_0)\colon |f(x)| > c$.
:::

::: {.proposition ref="prop:lec08:local" status="доказано в лекции 8"}
Если $\lim_{x \to x_0} f(x) = A \in \R$, то $|f(x)| < |A| + 1$ около $x_0$; если $A \ne 0$, то $|f(x)| > \frac{|A|}{2}$ около $x_0$. *Идея:* определение Коши с $\varepsilon = 1$ и $\varepsilon = \frac{|A|}{2}$, неравенство треугольника. В пределе частного условие $g \ne 0$ около $x_0$ следует из $B \ne 0$.
:::

::: {.corollary ref="cor:lec08:sign" status="доказано в лекции 8"}
Если $\lim_{x \to x_0} f(x) = A > 0$, то $f(x) > \frac A2 > 0$ в некоторой $\mathring{U}_\delta(x_0)$ (аналогично для $A < 0$).
:::

::: {.definition ref="def:lec08:one-sided"}
$\lim\limits_{x \to x_0 - 0} f(x) = A$ ($f(x_0 - 0) = A$): $\forall \varepsilon > 0\ \exists \delta > 0\ \forall x \in (x_0 - \delta;\ x_0)\colon |f(x) - A| < \varepsilon$. Предел справа $f(x_0 + 0)$ — то же с $x \in (x_0;\ x_0 + \delta)$.
:::

::: {.theorem ref="thm:lec08:one-sided" status="доказано в лекции 8"}
Если $f$ определена в $\mathring{U}_r(x_0)$, то $\lim_{x \to x_0} f(x) = A \Leftrightarrow f(x_0 - 0) = f(x_0 + 0) = A$. *Идея:* «$\Leftarrow$» — $\delta = \min(\delta_1, \delta_2)$.
:::

::: {.definition ref="def:lec08:infinity-nbhd"}
$U_M(+\infty) = (M; +\infty)$, $U_M(-\infty) = (-\infty; -M)$, $U_M(\infty) = (-\infty; -M) \cup (M; +\infty)$, $M > 0$.
:::

::: {.definition ref="def:lec08:general-limit"}
$\lim_{x \to a} f(x) = b$ ($a \in \{x_0, x_0 \pm 0, \pm\infty, \infty\}$, $b \in \{A, \pm\infty, \infty\}$): для любой окрестности $b$ найдётся окрестность $a$ (для $x_0$ — проколотая, для $x_0 \pm 0$ — половина), при всех $x$ из которой $f(x)$ лежит в окрестности $b$. Например, $\lim_{x \to +\infty} f(x) = A$: $\forall \varepsilon > 0\ \exists \Delta > 0\ \forall x > \Delta\colon |f(x) - A| < \varepsilon$; $\lim_{x \to x_0} f(x) = \infty$: $\forall M > 0\ \exists \delta > 0\ \forall x \in \mathring{U}_\delta(x_0)\colon |f(x)| > M$. Определение Гейне, арифметика конечных пределов, неравенства и теорема о сложной функции переносятся; условия 1–2 теоремы о сложной функции нужны только при конечном $A$ (замена $y = \frac1x$: $\lim_{x \to +\infty} x \sin\frac1x = \lim_{y \to +0} \frac{\sin y}{y} = 1$).
:::

::: {.definition ref="def:lec08:small-large"}
$f$ бесконечно малая при $x \to a$, если $\lim_{x \to a} f(x) = 0$; бесконечно большая, если $\lim_{x \to a} f(x) = \infty$.
:::

::: {.proposition ref="prop:lec08:small-large" status="доказано в лекции 8"}
При $x \to a$: $\frac{1}{\text{б.б.}}$ — б.м.; $\frac{1}{\text{б.м.}}$ — б.б., если $f \ne 0$ около $a$; (ограниченная около $a$)$\cdot$(б.м.) — б.м. *Идея:* по Гейне сводится к утверждениям лекции 4.
:::

::: {.proposition ref="prop:lec08:roots" status="доказано в лекции 8"}
$\sqrt x \to \sqrt{x_0}$ при $x \to x_0 > 0$, $\sqrt x \to 0$ при $x \to +0$; $\sqrt[3]{x} \to \sqrt[3]{x_0}$ при любом $x_0$. *Идея:* $|\sqrt x - \sqrt{x_0}| \le \frac{|x - x_0|}{\sqrt{x_0}}$; для кубического корня $a^2 + ab + b^2 \ge \frac34 b^2$.
:::

# Лекция 9 — Асимптоты. О-символика. Эквивалентные функции

::: {.definition ref="def:lec09:asymptotes"}
$x = x_0$ — вертикальная асимптота, если хотя бы один из $\lim_{x \to x_0 \pm 0} f(x)$ равен $+\infty$, $-\infty$ или $\infty$. $y = kx + b$ — наклонная асимптота при $x \to +\infty$ (при $x \to -\infty$), если $f(x) - (kx + b) \to 0$; при $k = 0$ — горизонтальная.
:::

::: {.theorem ref="thm:lec09:oblique" status="доказано в лекции 9; требуется на коллоквиуме"}
$y = kx + b$ — наклонная асимптота при $x \to +\infty$ $\Leftrightarrow$ существуют конечные $k = \lim_{x \to +\infty} \frac{f(x)}{x}$ и $b = \lim_{x \to +\infty}(f(x) - kx)$. *Идея:* «$\Rightarrow$» — $\frac{f(x)}{x} - k = (f(x) - kx) \cdot \frac1x \to b \cdot 0$; «$\Leftarrow$» — определение.
:::

::: {.corollary ref="cor:lec09:unique" status="доказано в лекции 9"}
При $x \to +\infty$ (и при $x \to -\infty$) наклонная асимптота не более чем одна. *Идея:* $k$ и $b$ — пределы, а предел единствен.
:::

::: {.definition ref="def:lec09:o"}
При $g \ne 0$ около $a$: $f = o(g)$ при $x \to a$, если $\frac fg \to 0$; $f = O(g)$, если $\frac fg$ ограничена в некоторой окрестности $a$. $o(1)$ — бесконечно малая, $O(1)$ — ограниченная около $a$.
:::

::: {.proposition ref="prop:lec09:o-rules" status="доказано в лекции 9"}
$o(g) \pm o(g) = o(g)$, $c \cdot o(g) = o(g)$, $o(g) = O(g)$, $h \cdot o(g) = o(hg)$, $O(g) \cdot o(h) = o(gh)$, $O(g) \cdot O(h) = O(gh)$, $o(O(g)) = O(o(g)) = o(g)$; при $x \to 0$, $m < n$: $o(x^n) = o(x^m)$, $x^m \cdot o(x^n) = o(x^{m+n})$. Равенства читаются слева направо. *Идея:* отношения и арифметика предела, «ограниченная · б.м. = б.м.».
:::

::: {.definition ref="def:lec09:equivalent"}
При $g \ne 0$ около $a$: $f \sim g$ при $x \to a$, если $\frac{f(x)}{g(x)} \to 1$.
:::

::: {.proposition ref="prop:lec09:equiv-props" status="доказано в лекции 9"}
$\sim$ рефлексивно, симметрично, транзитивно; если $f \sim f_1$, $g \sim g_1$, то $fg \sim f_1 g_1$, $\frac fg \sim \frac{f_1}{g_1}$. *Идея:* симметричность — $\frac fg \to 1$ отделима от нуля около $a$.
:::

::: {.theorem ref="thm:lec09:equiv-o" status="доказано в лекции 9"}
$f \sim g \Leftrightarrow f = g + o(g)$. *Идея:* $\frac{f - g}{g} = \frac fg - 1$.
:::

::: {.corollary ref="cor:lec09:main-part" status="доказано в лекции 9"}
Если $h = o(f)$, то $f + h \sim f$.
:::

::: {.definition ref="def:lec09:main-part"}
Главная часть $f$ при $x \to 0$ — функция $c x^k$, $c \ne 0$, с $f \sim c x^k$ (при $x \to x_0$ — $c(x - x_0)^k$, при $x \to \infty$ — $c x^k$); она единственна.
:::

::: {.proposition ref="prop:lec09:table" status="доказано в лекции 9"}
При $x \to 0$: $\sin x \sim x$, $\operatorname{tg} x \sim x$, $1 - \cos x \sim \frac{x^2}{2}$, $\sqrt{1 + x} - 1 \sim \frac x2$, $\sqrt[3]{1 + x} - 1 \sim \frac x3$, $(1 + x)^n - 1 \sim nx$. *Идея:* первый замечательный предел; сопряжённое и неполный квадрат; бином.
:::

::: {.proposition ref="prop:lec09:substitution" status="доказано в лекции 9"}
Если $u(x) \to 0$ при $x \to a$ и $u \ne 0$ около $a$, то из $f(y) \sim g(y)$ при $y \to 0$ следует $f(u(x)) \sim g(u(x))$, из $h(y) = o(y^k)$ — $h(u(x)) = o(u(x)^k)$. *Идея:* теорема о пределе сложной функции, условие 2.
:::

::: {.theorem ref="thm:lec09:replacement" status="доказано в лекции 9"}
Если $f \sim f_1$ при $x \to a$, то $\lim f h$ и $\lim f_1 h$, а также $\lim \frac hf$ и $\lim \frac h{f_1}$, существуют (конечные или бесконечные) одновременно и равны. В суммах заменять слагаемые на эквивалентные нельзя. *Идея:* $fh = \frac{f}{f_1} \cdot f_1 h$, $\frac{f}{f_1} \to 1$.
:::

# Глоссарий курса

::: course-glossary
:::
