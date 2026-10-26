---
course: discrete
title: "Теория: дискретная математика"
---

# Соглашения курса

Здесь только то, что в курсе принято иначе, чем в других книгах и курсах, или обозначается по-своему. Ловушки и корнер-кейсы — в замечаниях лекций.

- $0 \in \N$: $\N = \{0, 1, 2, \dots\}$, положительные натуральные — $\N_+$ (замечание [-@rem:lec01:nat]); поэтому база индукции — $\varphi(0)$ (замечание [-@rem:lec05:nat]). В матанализе соглашение обратное.
- Скобки в $A \to B \to C$ и $A \wedge B \vee C$ не опускаются: правил приоритета для них нет (замечание [-@rem:lec01:no-priority]).
- Предметная область квантора всегда непуста (замечание [-@rem:lec02:nonempty]).
- С лекции 6 «число» — целое (замечание [-@rem:lec06:integers]).
- Сравнения по модулю $m$ рассматриваются только при $m > 1$ (замечание [-@rem:lec06:modulus]).
- $\deg(p, n)$ — показатель простого $p$ в разложении $n$; для $n = 0$ не определён (определение [-@def:lec06:deg]).
- НОД и НОК — натуральные числа, определённые через делимость: $\gcd(0, 0) = 0$, $\operatorname{lcm}(0, a) = 0$; в формулах $\gcd$, $\operatorname{lcm}$, в тексте НОД, НОК (замечание [-@rem:lec07:gcd-natural]).
- $\varphi(m)$ считает взаимно простые с $m$ числа среди $0, 1, \dots, m - 1$; $a^{-1}$ и $a^{-k} = (a^{-1})^k$ по модулю $m$ — числа из $\{0, \dots, m - 1\}$ и их степени, а не дроби (определения [-@def:lec07:inverse], [-@def:lec07:neg-power]).
- Решение сравнения $ax \equiv c \pmod m$ — число из $\{0, \dots, m - 1\}$, решение системы — кортеж чисел из $\{0, \dots, \mu - 1\}$, $\mu$ — НОК модулей; поэтому «число решений» всегда считается по модулю (НОК) исходных модулей (замечание [-@rem:lec08:solution-convention], определение [-@def:lec08:system]).
- Композиция отношений читается справа налево: в $Q \circ P$ первым действует $P$, как в $g(f(x))$; в курсе алгебры подстановки, наоборот, умножаются слева направо (замечание [-@rem:lec09:order]).
- Функция $f\colon A \to B$ отождествляется со своим графиком $f \subseteq A \times B$; множество $B$ ею не определяется, поэтому сюръективность всегда понимается «для $B$» (замечание [-@rem:lec10:codomain]). Для отношения $R \subseteq A \times B$ «тотально» по умолчанию значит «тотально для $A$», «сюръективно» — «сюръективно для $B$» (определение [-@def:lec10:total-surjective]).
- Жирное $\mathbf{n}$ — множество $\{0, 1, \dots, n - 1\}$, обычное $n$ — число; $\mathbf{2}^X$ — функции из $X$ в $\{0, 1\}$, $X^2$ — декартов квадрат (замечание [-@rem:lec11:bold]). Мощность $|A|$ определена только для конечных множеств; бесконечные сравниваются через $\sim$ и $\lesssim$ (замечание [-@rem:lec12:abs]).

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

# Лекция 3 — Строки: индуктивные определения, индукция и рекурсия

::: {.definition ref="def:lec03:string"}
$S(A)$: $[\,] \in S(A)$; если $s \in S(A)$, $x \in A$, то $x : s \in S(A)$ ($x$ — голова, $s$ — хвост); других строк нет. $[x_1, \dots, x_n] := x_1 : (x_2 : (\dots : (x_n : [\,]) \dots))$.
:::

::: {.axiom ref="ax:lec03:a1a2"}
(A1) $[\,] \ne x : s$; (A2) $x : s = y : t \iff x = y \wedge s = t$.
:::

::: {.axiom ref="ax:lec03:induction"}
(ПИ) $P([\,]) \wedge \forall s\, \forall x\, (P(s) \to P(x : s)) \to \forall s\, P(s)$; база, переход (шаг), предположение индукции. Из (A1), (A2) не выводится.
:::

::: {.proposition ref="prop:lec03:cons-neq" status="доказано в лекции 3"}
$y : s \ne s$ для всех $s$, $y$. *Идея:* индукция по $s$ с предикатом $\forall y\, (y : s \ne s)$; в переходе (A2) сводит к предположению индукции при $y := x$.
:::

::: {.definition ref="def:lec03:lh"}
$\mathrm{lh}([\,]) = 0$, $\mathrm{lh}(x : s) = 1 + \mathrm{lh}(s)$ (в листках $\mathrm{len}$).
:::

::: {.definition ref="def:lec03:app"}
$\mathrm{app}([\,], t) = t$, $\mathrm{app}(x : s, t) = x : \mathrm{app}(s, t)$ — рекурсия по первому аргументу.
:::

::: {.lemma ref="lem:lec03:app-nil" status="доказано в лекции 3"}
$\mathrm{app}(s, [\,]) = s$. *Идея:* индукция по $s$.
:::

::: {.lemma ref="lem:lec03:app-assoc" status="доказано в лекции 3"}
$\mathrm{app}(s, \mathrm{app}(t, r)) = \mathrm{app}(\mathrm{app}(s, t), r)$. *Идея:* индукция по $s$ — аргументу рекурсии; индукция по $t$ или $r$ застревает.
:::

::: {.proposition ref="prop:lec03:lh-app" status="доказано в лекции 3"}
$\mathrm{lh}(\mathrm{app}(s, t)) = \mathrm{lh}(s) + \mathrm{lh}(t)$. *Идея:* индукция по $s$.
:::

::: {.lemma ref="lem:lec03:cancel-left" status="доказано в лекции 3"}
$\mathrm{app}(s, t) = \mathrm{app}(s, r) \Rightarrow t = r$. *Идея:* индукция по $s$, в переходе (A2).
:::

::: {.lemma ref="lem:lec03:app-empty" status="доказано в лекции 3"}
$\mathrm{app}(s, t) = [\,] \Rightarrow s = t = [\,]$. *Идея:* разбор случаев $s = [\,]$ / $s = x : r$, второй противоречит (A1).
:::

::: {.definition ref="def:lec03:rev"}
$\mathrm{rev}([\,]) = [\,]$, $\mathrm{rev}(x : s) = \mathrm{app}(\mathrm{rev}(s), [x])$.
:::

::: {.proposition ref="prop:lec03:rev-app" status="доказано в лекции 3"}
$\mathrm{rev}(\mathrm{app}(s, t)) = \mathrm{app}(\mathrm{rev}(t), \mathrm{rev}(s))$. *Идея:* индукция по $s$; база — правая единица, переход — ассоциативность.
:::

::: {.corollary ref="cor:lec03:rev-rev" status="доказано в лекции 3"}
$\mathrm{rev}(\mathrm{rev}(s)) = s$. *Идея:* индукция по $s$ с переворотом конкатенации и $\mathrm{rev}([x]) = [x]$. Отсюда сокращение справа без индукции.
:::

# Лекция 4 — Множества

::: {.axiom ref="ax:lec04:foundation"}
Нет бесконечных цепочек $x_0 \ni x_1 \ni x_2 \ni \dots$
:::

::: {.proposition ref="prop:lec04:not-self" status="доказано в лекции 4"}
$a \notin a$ для любого $a$; отсюда $a \ne \{a\}$. *Идея:* иначе цепочка $a \ni a \ni \dots$
:::

::: {.definition ref="def:lec04:equal"}
$A = B \iff \forall x\, (x \in A \iff x \in B)$.
:::

::: {.axiom ref="ax:lec04:equality"}
$A = B \wedge B \in C \Rightarrow A \in C$; равные множества взаимозаменяемы.
:::

::: {.definition ref="def:lec04:subset"}
$A \subseteq B \iff \forall x\, (x \in A \Rightarrow x \in B)$; собственное подмножество — $A \subseteq B$, $A \ne B$.
:::

::: {.lemma ref="lem:lec04:subset" status="доказано в лекции 4"}
$A \subseteq A$; $A \subseteq B \subseteq C \Rightarrow A \subseteq C$; $A = B \iff A \subseteq B \wedge B \subseteq A$. *Идея:* произвольный элемент.
:::

::: {.axiom ref="ax:lec04:listing"}
Существует $\{a_1, \dots, a_n\}$: $x \in \{a_1, \dots, a_n\} \iff x = a_1 \vee \ldots \vee x = a_n$; синглетон $\{a\}$.
:::

::: {.axiom ref="ax:lec04:specification"}
Существует $\{x \in A \mid \varphi(x)\}$: $y \in \{x \in A \mid \varphi(x)\} \iff y \in A \wedge \varphi(y)$.
:::

::: {.definition ref="def:lec04:empty"}
$E$ пусто, если $\forall x\, (x \notin E)$; $\varnothing = \{x \in \N \mid x \ne x\}$.
:::

::: {.lemma ref="lem:lec04:empty" status="доказано в лекции 4"}
Пустое множество — подмножество любого; любые два пустых множества равны, так что $\varnothing$ единственно. *Идея:* пустая истина.
:::

::: {.definition ref="def:lec04:bounded"}
$\forall x \in A\ \varphi \equiv \forall x\, (x \in A \to \varphi)$, $\exists x \in A\ \varphi \equiv \exists x\, (x \in A \wedge \varphi)$.
:::

::: {.proposition ref="prop:lec04:bounded-neg" status="доказано в лекции 4"}
$\neg\forall x \in A\ \varphi \equiv \exists x \in A\ \neg\varphi$, $\neg\exists x \in A\ \varphi \equiv \forall x \in A\ \neg\varphi$. *Идея:* отрицание кванторов и $\neg(P \to Q) \equiv P \wedge \neg Q$.
:::

::: {.lemma ref="lem:lec04:russell" status="доказано в лекции 4"}
Нет $R$ с $\forall x\, (x \in R \iff x \notin x)$. *Идея:* подставить $x := R$.
:::

::: {.corollary ref="cor:lec04:no-universal" status="доказано в лекции 4"}
$\{x \in A \mid x \notin x\} \notin A$; множества всех множеств нет. *Идея:* рассуждение Рассела внутри $A$.
:::

::: {.axiom ref="ax:lec04:powerset"}
Существует $\mathcal{P}(A)$: $x \in \mathcal{P}(A) \iff x \subseteq A$.
:::

::: {.axiom ref="ax:lec04:union"}
Существует $\bigcup A$: $x \in \bigcup A \iff \exists \alpha\, (x \in \alpha \wedge \alpha \in A)$.
:::

::: {.definition ref="def:lec04:operations"}
$A \cup B = \bigcup\{A, B\}$, $A \cap B = \{x \in A \mid x \in B\}$, $A \setminus B = \{x \in A \mid x \notin B\}$; непересекающиеся — $A \cap B = \varnothing$.
:::

::: {.lemma ref="lem:lec04:subset-equiv" status="доказано в лекции 4"}
$A \subseteq B \iff A \cap B = A \iff A \cup B = B$. *Идея:* доказательство по кругу.
:::

::: {.definition ref="def:lec04:complement"}
$\bar A = U \setminus A$ для $A \subseteq U$; $A \setminus B = A \cap \bar B$.
:::

::: {.theorem ref="thm:lec04:identities" status="доказано в лекции 4"}
Коммутативность, ассоциативность, идемпотентность, поглощение, $\bar{\bar A} = A$, две дистрибутивности, законы де Моргана, свойства $\varnothing$ и $U$, $A \cap \bar A = \varnothing$, $A \cup \bar A = U$. *Идея:* поэлементный перевод в логические эквивалентности; на практике — таблица принадлежности из $2^k$ строк.
:::

::: {.definition ref="def:lec04:pair"}
$(a, b) = \{\{a\}, \{a, b\}\}$ (по Куратовскому); $(a, a) = \{\{a\}\}$.
:::

::: {.lemma ref="lem:lec04:pair" status="доказано в лекции 4"}
$(a, b) = (c, d) \iff a = c \wedge b = d$. *Идея:* из $\{a\} \in (c, d)$ получить $a = c$, затем разобрать $\{a, b\} = \{c\}$ и $\{a, b\} = \{c, d\}$.
:::

::: {.definition ref="def:lec04:product"}
$A \times B = \{z \in \mathcal{P}(\mathcal{P}(A \cup B)) \mid \exists a \in A\ \exists b \in B\ z = (a, b)\}$; $A_1 \times \ldots \times A_n$ — скобки слева.
:::

::: {.definition ref="def:lec04:power"}
$A^0 = \{\varnothing\}$, $A^1 = A$, $A^n = A \times \ldots \times A$ при $n \ge 2$; $A^{n+1} = A^n \times A$ только при $n \ge 1$.
:::

::: {.definition ref="def:lec04:tuple"}
$(a_1, \dots, a_n) = ((\dots(a_1, a_2), \dots), a_n)$ при $n \ge 2$.
:::

::: {.lemma ref="lem:lec04:tuple" status="доказано в лекции 4"}
$(a_1, \dots, a_n) = (b_1, \dots, b_n) \iff \forall i\ a_i = b_i$. *Идея:* критерий равенства пар $n - 1$ раз.
:::

# Лекция 5 — Индукция на натуральных числах

::: {.axiom ref="ax:lec05:induction"}
ПМИ: $\varphi(0) \wedge \forall n \in \N\, (\varphi(n) \to \varphi(n + 1)) \to \forall n \in \N\ \varphi(n)$; для множеств: если $X \subseteq \N$, $0 \in X$ и $n \in X \Rightarrow n + 1 \in X$ при всех $n$, то $X = \N$.
:::

::: {.proposition ref="prop:lec05:shifted" status="доказано в лекции 5"}
Если $\varphi(n_0)$ и $\varphi(n) \to \varphi(n + 1)$ при всех $n \ge n_0$, то $\varphi(n)$ при всех $n \ge n_0$. *Идея:* ПМИ для $\psi(n) := (n \ge n_0 \to \varphi(n))$; при $n < n_0$ — пустая истина.
:::

::: {.definition ref="def:lec05:progressive"}
$X \subseteq \N$ прогрессивно, $\mathrm{Prog}(X)$, если $\forall n\, \bigl(\forall m < n\ (m \in X) \to n \in X\bigr)$.
:::

::: {.proposition ref="prop:lec05:strong" status="доказано в лекции 5 (теорема о равносильности)"}
ПСИ: всякое прогрессивное $X \subseteq \N$ равно $\N$.
:::

::: {.lemma ref="lem:lec05:prog-zero" status="доказано в лекции 5"}
Если $\mathrm{Prog}(X)$, то $0 \in X$. *Идея:* при $n = 0$ посылка $\forall m < 0\ (m \in X)$ — пустая истина.
:::

::: {.proposition ref="prop:lec05:lnp" status="доказано в лекции 5 (теорема о равносильности)"}
ПНЧ: всякое непустое $X \subseteq \N$ имеет наименьший элемент $\min X$. Для $\Z$ и для $\{x \in \Q \mid x > 0\}$ неверно.
:::

::: {.theorem ref="thm:lec05:equiv" status="доказано в лекции 5"}
ПСИ, ПНЧ и ПМИ равносильны. *Идея:* ПСИ $\Rightarrow$ ПНЧ — если у $X$ нет минимума, то $\overline{X}$ прогрессивно; ПНЧ $\Rightarrow$ ПМИ — $n = \min \overline{X} = m + 1$ с $m \in X$; ПМИ $\Rightarrow$ ПСИ — индукция для $Y = \{n \mid \forall m < n\ (m \in X)\}$.
:::

# Лекция 6 — Делимость

::: {.definition ref="def:lec06:divides"}
$a \mid b \iff \exists k \in \Z\ b = ak$; делитель, кратное. $0 \mid 0$ верно.
:::

::: {.lemma ref="lem:lec06:basic" status="доказано в лекции 6"}
$a \mid 0$; $1 \mid a$; $0 \mid a \Rightarrow a = 0$; $a \mid 1 \Rightarrow a = \pm 1$. *Идея:* последнее — из $1 = |a| \cdot |k| \ge |a| \ge 1$.
:::

::: {.lemma ref="lem:lec06:order" status="доказано в лекции 6"}
$a \mid a$; $a \mid b \wedge b \mid c \Rightarrow a \mid c$; $a \mid b \wedge b \mid a \Rightarrow a = \pm b$. *Идея:* в третьем $a = a k_1 k_2$, случаи $a = 0$ и $k_1 k_2 = 1$.
:::

::: {.lemma ref="lem:lec06:sum" status="доказано в лекции 6"}
$a \mid b \wedge a \mid c \Rightarrow a \mid b \pm c$.
:::

::: {.corollary ref="cor:lec06:sum" status="доказано в лекции 6"}
Если $a \mid b$ и $a \mid b + c$ (или $a \mid b - c$), то $a \mid c$.
:::

::: {.theorem ref="thm:lec06:division-nat" status="доказано в лекции 6"}
Для $a, b \in \N$, $b \ne 0$, существует единственная пара $(q, r) \in \N^2$ с $a = bq + r$, $0 \le r < b$. *Идея:* $q + 1 = \min\{s \in \N \mid a < bs\}$ по ПНЧ; единственность — из $r - r' = b(q' - q) \ge b$.
:::

::: {.definition ref="def:lec06:quotient"}
$q$ — неполное частное, $r$ — остаток от деления $a$ на $b$.
:::

::: {.corollary ref="cor:lec06:division" status="доказано в лекции 6"}
Теорема о делении с остатком: для $a$ и $b \ne 0$ существует единственная пара $(q, r) \in \Z \times \N$ с $a = bq + r$, $0 \le r < |b|$. *Идея:* делим $|a|$ на $|b|$; при $a < 0$, $r' > 0$ берём $-q' - 1$ и $|b| - r'$.
:::

::: {.definition ref="def:lec06:congruence"}
При $m > 1$: $a \equiv b \pmod m \iff m \mid a - b$.
:::

::: {.lemma ref="lem:lec06:same-rem" status="доказано в лекции 6"}
$a \equiv b \pmod m$ тогда и только тогда, когда остатки от деления $a$ и $b$ на $m$ равны. *Идея:* $m \mid r - r'$ и $|r - r'| < m$.
:::

::: {.corollary ref="cor:lec06:distinct" status="доказано в лекции 6"}
Числа $0, 1, \dots, m - 1$ попарно несравнимы по модулю $m$.
:::

::: {.corollary ref="cor:lec06:to-rem" status="доказано в лекции 6"}
$a \equiv r \pmod m$, где $r$ — остаток от деления $a$ на $m$.
:::

::: {.corollary ref="cor:lec06:equivalence" status="доказано в лекции 6"}
Сравнимость по модулю $m$ рефлексивна, симметрична и транзитивна.
:::

::: {.lemma ref="lem:lec06:arith" status="доказано в лекции 6"}
Если $a \equiv b$ и $c \equiv d \pmod m$, то $a \pm c \equiv b \pm d$, $ac \equiv bd$, $a^n \equiv b^n \pmod m$ ($n \in \N$). *Идея:* $ac - bd = m(bk_2 + dk_1 + mk_1k_2)$; степень — индукцией.
:::

::: {.definition ref="def:lec06:prime"}
Простое: $p > 1$, делители только $\pm 1, \pm p$; составное: $n > 1$, не простое. Отрицательные числа, $0$ и $1$ — ни то ни другое.
:::

::: {.lemma ref="lem:lec06:composite" status="доказано в лекции 6"}
$n > 1$ составное тогда и только тогда, когда $n = km$ с $1 < k, m < n$.
:::

::: {.definition ref="def:lec06:factorization"}
Разложение $n \ge 1$: $n = p_1^{a_1} \cdots p_s^{a_s}$, $p_i$ — попарно различные простые, $a_i \in \N$; степень простого $p$ в разложении ($0$, если $p$ нет в списке); разложения существенно одинаковы, если степени всех простых совпадают.
:::

::: {.theorem ref="thm:lec06:fta" status="доказано в лекции 6"}
ОТА: каждое $n \ge 1$ имеет разложение на простые, и любые два его разложения существенно одинаковы. *Идея:* обе части доказываются минимальным контрпримером. Единственность: у наименьшего «плохого» $n$ общих простых в двух разложениях нет; для $p > q$ из разных разложений число $m = (p - q) \cdot \frac{n}{p} < n$ имеет разложения с разной степенью $q$, если $q \nmid p - q$, а $q \mid p - q$ даёт $q \mid p$.
:::

::: {.definition ref="def:lec06:deg"}
$\deg(p, n)$ для $n \ne 0$ — степень простого $p$ в любом разложении $\pm p_1^{a_1} \cdots p_s^{a_s}$ числа $n$; $\deg(p, ab) = \deg(p, a) + \deg(p, b)$.
:::

::: {.theorem ref="thm:lec06:infinite" status="доказано в лекции 6"}
Простых чисел бесконечно много. *Идея:* простой делитель числа $p_1 \cdots p_n + 1$ не может быть ни одним из $p_i$.
:::

::: {.lemma ref="lem:lec06:criterion" status="доказано в лекции 6"}
Признак делимости: для $a, b \ne 0$ $a \mid b$ тогда и только тогда, когда $\deg(p, a) \le \deg(p, b)$ для всех простых $p$. *Идея:* $\deg(p, ak) = \deg(p, a) + \deg(p, k)$; обратно $b = a \cdot (\pm \prod p_i^{\beta_i - \alpha_i})$.
:::

# Лекция 7 — НОД, тождество Безу, теоремы Эйлера и Ферма

::: {.definition ref="def:lec07:gcd"}
$d = \gcd(a, b)$ (НОД), если $d \in \N$, $d \mid a$, $d \mid b$ и каждый общий делитель $a$ и $b$ делит $d$.
:::

::: {.lemma ref="lem:lec07:gcd-exists" status="доказано в лекции 7"}
НОД существует и единствен; $\gcd(0, b) = |b|$; для ненулевых $a = \pm \prod p_i^{\alpha_i}$, $b = \pm \prod p_i^{\beta_i}$: $\gcd(a, b) = \prod p_i^{\min(\alpha_i, \beta_i)}$. *Идея:* единственность — два НОД делят друг друга; существование — признак делимости.
:::

::: {.definition ref="def:lec07:lcm"}
$m = \operatorname{lcm}(a, b)$ (НОК), если $m \in \N$, $a \mid m$, $b \mid m$ и $m$ делит каждое общее кратное $a$ и $b$.
:::

::: {.lemma ref="lem:lec07:lcm-exists" status="доказано в лекции 7"}
НОК существует и единственно; $\operatorname{lcm}(0, a) = 0$; для ненулевых $a, b$: $\operatorname{lcm}(a, b) = \prod p_i^{\max(\alpha_i, \beta_i)}$.
:::

::: {.proposition ref="prop:lec07:gcd-lcm-props" status="доказано в лекции 7"}
НОД и НОК симметричны и ассоциативны. Кроме того, $\gcd(a, a) = \operatorname{lcm}(a, a) = |a|$, а также $\gcd(a, \operatorname{lcm}(a, b)) = |a|$ и $\operatorname{lcm}(a, \gcd(a, b)) = |a|$. Главное: $\gcd(a, b) \cdot \operatorname{lcm}(a, b) = |ab|$. *Идея:* последнее — $\min + \max = \alpha + \beta$.
:::

::: {.lemma ref="lem:lec07:gcd-shift" status="доказано в лекции 7"}
$\gcd(a, b) = \gcd(a + bq, b)$ для любых $a, b, q$. *Идея:* у двух пар одни и те же общие делители.
:::

::: {.corollary ref="cor:lec07:gcd-rem" status="доказано в лекции 7"}
Если $r$ — остаток от деления $a$ на $b$, то $\gcd(r, b) = \gcd(a, b)$.
:::

::: {.definition ref="def:lec07:coprime"}
$a$ и $b$ взаимно просты, если $\gcd(a, b) = 1$.
:::

::: {.lemma ref="lem:lec07:coprime-equiv" status="доказано в лекции 7"}
Равносильны: $\gcd(a, b) = 1$; каждый общий делитель равен $\pm 1$; нет общего простого делителя; (при $a, b \ne 0$) $\min(\deg(p, a), \deg(p, b)) = 0$ для всех простых $p$.
:::

::: {.corollary ref="cor:lec07:divide-gcd" status="доказано в лекции 7"}
Если $(a, b) \ne (0, 0)$, то $\frac{a}{\gcd(a, b)}$ и $\frac{b}{\gcd(a, b)}$ — целые взаимно простые.
:::

::: {.lemma ref="lem:lec07:coprime-divides" status="доказано в лекции 7"}
Если $a \mid bc$ и $\gcd(a, b) = 1$, то $a \mid c$. *Идея:* $\alpha_i \le \beta_i + \gamma_i$ и $\min(\alpha_i, \beta_i) = 0$ дают $\alpha_i \le \gamma_i$; другое доказательство — умножить $au + bv = 1$ на $c$.
:::

::: {.corollary ref="cor:lec07:cancel" status="доказано в лекции 7"}
Если $ax \equiv ay \pmod m$ и $\gcd(a, m) = 1$, то $x \equiv y \pmod m$.
:::

::: {.theorem ref="thm:lec07:bezout" status="доказано в лекции 7"}
Тождество Безу: если $\gcd(a, b) = 1$, то $au + bv = 1$ для некоторых $u, v \in \Z$. *Идея:* по ПНЧ берём наименьшее $d > 0$ вида $as + bt$; остаток от деления $a$ (и $b$) на $d$ того же вида и меньше $d$, поэтому равен $0$; значит, $d$ — общий делитель, $d = 1$.
:::

::: {.corollary ref="cor:lec07:bezout-gcd" status="доказано в лекции 7"}
Для любых $a, b$ существуют $u, v$ с $au + bv = \gcd(a, b)$. *Идея:* Безу для $a / \gcd$ и $b / \gcd$, затем умножить на $\gcd$.
:::

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
Функция Эйлера: $\varphi(m)$ при $m > 1$ — количество чисел из $\{0, 1, \dots, m - 1\}$, взаимно простых с $m$; $\varphi(p) = p - 1$.
:::

::: {.theorem ref="thm:lec07:euler" status="доказано в лекции 7"}
Теорема Эйлера: если $m > 1$ и $\gcd(a, m) = 1$, то $a^{\varphi(m)} \equiv 1 \pmod m$. *Идея:* остатки чисел $aq_1, \dots, aq_s$ ($q_i$ — взаимно простые с $m$ остатки) попарно различны и взаимно просты с $m$, то есть совпадают с $q_1, \dots, q_s$; перемножить и сократить на $q_1 \cdots q_s$.
:::

::: {.corollary ref="cor:lec07:fermat" status="доказано в лекции 7"}
Малая теорема Ферма: если $p$ простое и $p \nmid a$, то $a^{p-1} \equiv 1 \pmod p$.
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

# Лекция 9 — Бинарные отношения

::: {.definition ref="def:lec09:relation"}
Бинарное отношение между $A$ и $B$ — любое $R \subseteq A \times B$; при $A = B$ — отношение на $A$. Запись $xRy$ означает $(x, y) \in R$.
:::

::: {.definition ref="def:lec09:dom-rng"}
$\operatorname{dom} R = \{a \mid \exists b\, (a, b) \in R\}$, $\operatorname{rng} R = \{b \mid \exists a\, (a, b) \in R\}$, поле — $\operatorname{dom} R \cup \operatorname{rng} R$.
:::

::: {.definition ref="def:lec09:identity"}
$\mathrm{id}_A = \{(x, x) \mid x \in A\}$.
:::

::: {.definition ref="def:lec09:converse"}
$R^{-1} = \{(b, a) \mid (a, b) \in R\}$; $(b, a) \in R^{-1} \iff (a, b) \in R$, $\operatorname{dom} R^{-1} = \operatorname{rng} R$, $\operatorname{rng} R^{-1} = \operatorname{dom} R$.
:::

::: {.definition ref="def:lec09:complement"}
Для $R \subseteq A \times B$: $\overline{R} = (A \times B) \setminus R$ (зависит от выбора $A$ и $B$).
:::

::: {.lemma ref="lem:lec09:converse-props" status="доказано в лекции 9"}
$(P^{-1})^{-1} = P$; $(P \cup Q)^{-1} = P^{-1} \cup Q^{-1}$; $(P \cap Q)^{-1} = P^{-1} \cap Q^{-1}$; для $P \subseteq A \times B$: $(\overline{P})^{-1} = \overline{P^{-1}}$ (дополнения до $A \times B$ и $B \times A$). *Идея:* цепочка равносильностей для произвольной пары.
:::

::: {.corollary ref="cor:lec09:converse-mono" status="доказано в лекции 9"}
Если $P \subseteq Q$, то $P^{-1} \subseteq Q^{-1}$. *Идея:* $Q = P \cup Q$ и обращение объединения.
:::

::: {.proposition ref="prop:lec09:converse-ne-complement" status="доказано в лекции 9"}
Если $R \subseteq A \times B$, $A \ne \varnothing$, $B \ne \varnothing$, то $R^{-1} \ne \overline{R}$. *Идея:* $R = \varnothing$ не подходит; из $(a, b) \in R$ получаем $b \in A \cap B$, и для пары $(b, b)$ выходит $(b, b) \in R \iff (b, b) \notin R$.
:::

::: {.definition ref="def:lec09:composition"}
$Q \circ P = \{(a, c) \mid \exists b\, (aPb \wedge bQc)\}$ — сначала $P$, потом $Q$.
:::

::: {.proposition ref="prop:lec09:identity-unit" status="доказано в лекции 9"}
Если $R \subseteq A \times B$, то $R \circ \mathrm{id}_A = R = \mathrm{id}_B \circ R$.
:::

::: {.theorem ref="thm:lec09:assoc" status="доказано в лекции 9"}
$R \circ (Q \circ P) = (R \circ Q) \circ P$. *Идея:* обе части — «путь $P$, $Q$, $R$»; переставить $\exists b\, \exists c$ и вносить/выносить конъюнкт, не зависящий от переменной квантора.
:::

::: {.theorem ref="thm:lec09:converse-comp" status="доказано в лекции 9"}
$(Q \circ P)^{-1} = P^{-1} \circ Q^{-1}$. *Идея:* $(c, a) \in Q \circ P \iff \exists b\, (cPb \wedge bQa) \iff \exists b\, (aQ^{-1}b \wedge bP^{-1}c)$.
:::

::: {.lemma ref="lem:lec09:distrib" status="доказано в лекции 9"}
$(P \cup Q) \circ R = (P \circ R) \cup (Q \circ R)$; $(P \cap Q) \circ R \subseteq (P \circ R) \cap (Q \circ R)$, и включение бывает строгим. Так же слева: $R \circ (P \cup Q) = (R \circ P) \cup (R \circ Q)$. *Идея:* $\exists$ проходит сквозь $\vee$, но из $\exists (A \wedge B)$ следует лишь $\exists A \wedge \exists B$; левая версия — обращением.
:::

::: {.definition ref="def:lec09:image"}
Образ $R[X] = \{b \mid \exists a \in X\ aRb\}$, прообраз $R^{-1}[X] = \{a \mid \exists b \in X\ aRb\}$.
:::

::: {.proposition ref="prop:lec09:image-props" status="доказано в лекции 9"}
$R[X \cup Y] = R[X] \cup R[Y]$; $X \subseteq Y \Rightarrow R[X] \subseteq R[Y]$; $R[\varnothing] = \varnothing$; $R[X \cap Y] \subseteq R[X] \cap R[Y]$ (бывает строго); $(R \circ Q)[X] = R[Q[X]]$. *Идея:* те же законы о кванторах, что и для композиции; включение для $\cap$ — из монотонности.
:::

# Лекция 10 — Функции

::: {.definition ref="def:lec10:functional-injective"}
$R$ функционально, если $(xRy \wedge xRz) \Longrightarrow y = z$; инъективно, если $(yRx \wedge zRx) \Longrightarrow y = z$ (для всех $x$, $y$, $z$).
:::

::: {.definition ref="def:lec10:total-surjective"}
$R$ тотально для $Z$, если $\forall x \in Z\ \exists y\ xRy$ (то есть $Z \subseteq \operatorname{dom} R$); сюръективно для $Z$, если $\forall x \in Z\ \exists y\ yRx$ (то есть $Z \subseteq \operatorname{rng} R$). Для $R \subseteq A \times B$ по умолчанию $Z = A$ для тотальности и $Z = B$ для сюръективности.
:::

::: {.lemma ref="lem:lec10:duality" status="доказано в лекции 10"}
$R$ функционально $\iff$ $R^{-1}$ инъективно; $R$ инъективно $\iff$ $R^{-1}$ функционально; $R$ тотально для $Z$ $\iff$ $R^{-1}$ сюръективно для $Z$; $R$ сюръективно для $Z$ $\iff$ $R^{-1}$ тотально для $Z$. *Идея:* $xRy \iff yR^{-1}x$ превращает одно определение в другое; вторые половины — применением первых к $R^{-1}$.
:::

::: {.lemma ref="lem:lec10:composition" status="доказано в лекции 10"}
Пусть $Q \subseteq A \times B$, $R \subseteq B \times C$. Если $Q$ и $R$ функциональны (инъективны), то $R \circ Q$ функционально (инъективно); если $Q$ тотально для $A$, а $R$ — для $B$, то $R \circ Q$ тотально для $A$; если $Q$ сюръективно для $B$, а $R$ — для $C$, то $R \circ Q$ сюръективно для $C$. *Идея:* функциональность и тотальность — прямо по путям из двух стрелок; инъективность и сюръективность — двойственностью и $(R \circ Q)^{-1} = Q^{-1} \circ R^{-1}$.
:::

::: {.proposition ref="prop:lec10:cap" status="доказано в лекции 10"}
Если $R$ инъективно, то $R[X \cap Y] = R[X] \cap R[Y]$; если $R$ функционально, то $R^{-1}[X \cap Y] = R^{-1}[X] \cap R^{-1}[Y]$. *Идея:* две стрелки в общую точку образа выходят из одной точки; для прообраза — применить к инъективному $R^{-1}$.
:::

::: {.proposition ref="prop:lec10:preimage-image" status="доказано в лекции 10"}
Если $R \subseteq A \times B$ тотально и $X \subseteq A$, то $X \subseteq R^{-1}[R[X]]$ (равенство не обязательно даже для функций).
:::

::: {.definition ref="def:lec10:function"}
$f \subseteq A \times B$ — функция из $A$ в $B$ ($f\colon A \to B$), если $f$ функционально и тотально для $A$. Тогда $\operatorname{dom} f = A$, $\operatorname{rng} f \subseteq B$; множество $B$ функцией не определяется.
:::

::: {.definition ref="def:lec10:value"}
Для $f\colon A \to B$ и $x \in A$ значение $f(x)$ — единственный $y$ с $(x, y) \in f$; $f[\{x\}] = \{f(x)\}$.
:::

::: {.lemma ref="lem:lec10:equality" status="доказано в лекции 10"}
Для $f\colon A \to B$, $g\colon C \to D$: $f = g \iff A = C \wedge \forall x \in A\ f(x) = g(x)$. *Идея:* $A = \operatorname{dom} f$; при равных значениях каждая пара $f$ лежит в $g$ и наоборот.
:::

::: {.proposition ref="prop:lec10:comp-values" status="доказано в лекции 10"}
Если $f\colon A \to B$, $g\colon B \to C$, то $g \circ f\colon A \to C$ и $(g \circ f)(a) = g(f(a))$. *Идея:* лемма о композиции; путь $a \to f(a) \to g(f(a))$.
:::

::: {.definition ref="def:lec10:functions-set"}
$B^A = \{f \in \mathcal{P}(A \times B) \mid f\colon A \to B\}$; $B^\varnothing = \{\varnothing\}$, $\varnothing^A = \varnothing$ при $A \ne \varnothing$.
:::

::: {.definition ref="def:lec10:bijection"}
Функция $f\colon A \to B$ — инъекция, если инъективна; сюръекция, если сюръективна для $B$; биекция (взаимно однозначное соответствие), если и то и другое.
:::

::: {.proposition ref="prop:lec10:by-values" status="доказано в лекции 10"}
$f\colon A \to B$ инъективна тогда и только тогда, когда из $f(x) = f(y)$ при $x, y \in A$ следует $x = y$; сюръективна тогда и только тогда, когда $\forall y \in B\ \exists x \in A\ f(x) = y$.
:::

::: {.lemma ref="lem:lec10:bijection-converse" status="доказано в лекции 10"}
$R \subseteq A \times B$ — биекция из $A$ в $B$ $\iff$ $R^{-1}$ — биекция из $B$ в $A$ (обратная функция $f^{-1}$). *Идея:* двойственность переставляет четыре свойства.
:::

::: {.corollary ref="cor:lec10:bijection-comp" status="доказано в лекции 10"}
Если $f\colon A \to B$ и $g\colon B \to C$ — биекции (инъекции, сюръекции), то $g \circ f\colon A \to C$ — биекция (инъекция, сюръекция); для биекций $(g \circ f)^{-1} = f^{-1} \circ g^{-1}$.
:::

::: {.lemma ref="lem:lec10:criteria" status="доказано в лекции 10"}
Для $R \subseteq A \times B$: функционально $\iff$ $R \circ R^{-1} \subseteq \mathrm{id}_B$; инъективно $\iff$ $R^{-1} \circ R \subseteq \mathrm{id}_A$; сюръективно $\iff$ $\mathrm{id}_B \subseteq R \circ R^{-1}$; тотально $\iff$ $\mathrm{id}_A \subseteq R^{-1} \circ R$. *Идея:* $(x, y) \in R \circ R^{-1} \iff \exists z\, (zRx \wedge zRy)$; пункты 2 и 4 — применить 1 и 3 к $R^{-1}$.
:::

::: {.corollary ref="cor:lec10:bijection-inverse" status="доказано в лекции 10"}
$R \subseteq A \times B$ — биекция из $A$ в $B$ $\iff$ $R^{-1} \circ R = \mathrm{id}_A$ и $R \circ R^{-1} = \mathrm{id}_B$.
:::

# Лекция 11 — Равномощные множества

::: {.definition ref="def:lec11:equinumerous"}
$A \sim B$ ($A$ и $B$ равномощны), если существует биекция $f\colon A \to B$; запись $A \sim_f B$.
:::

::: {.lemma ref="lem:lec11:equiv" status="доказано в лекции 11"}
$A \sim A$; $A \sim B \Rightarrow B \sim A$; $A \sim B \wedge B \sim C \Rightarrow A \sim C$. *Идея:* $\mathrm{id}_A$, обратная биекция, композиция биекций.
:::

::: {.proposition ref="prop:lec11:onto-image" status="доказано в лекции 11"}
Если $f\colon A \to B$ — инъекция, то $A \sim_f f[A]$ и $X \sim f[X]$ для всех $X \subseteq A$.
:::

::: {.theorem ref="thm:lec11:cantor" status="доказано в лекции 11"}
$A \nsim \mathcal{P}(A)$ для любого $A$; более того, сюръекции $A \to \mathcal{P}(A)$ нет. *Идея:* диагональное множество $X = \{a \in A \mid a \notin \varphi(a)\}$ отличается от каждого $\varphi(a)$ в точке $a$.
:::

::: {.theorem ref="thm:lec11:arithmetic" status="доказано в лекции 11 (пункт 4 — в задаче)"}
Если $A \sim B$, то $A \times C \sim B \times C$, $A^C \sim B^C$, $C^A \sim C^B$; $A \times B \sim B \times A$; $(A \times B) \times C \sim A \times (B \times C)$; $(A \times B)^C \sim A^C \times B^C$; $(C^B)^A \sim C^{A \times B}$. *Идея:* явные биекции; $C^A \to C^B$ — $f \mapsto f \circ \varphi^{-1}$; последний пункт — каррирование $f \mapsto ((a, b) \mapsto (f(a))(b))$.
:::

::: {.definition ref="def:lec11:n-set"}
$\mathbf{n} = \{k \in \N \mid k < n\} = \{0, \dots, n - 1\}$; $\mathbf{0} = \varnothing$, $\mathbf{2} = \{0, 1\}$.
:::

::: {.definition ref="def:lec11:indicator"}
Для $A \subseteq X$ индикатор $1_A\colon X \to \mathbf{2}$: $1_A(x) = 1$ при $x \in A$, $0$ при $x \notin A$.
:::

::: {.lemma ref="lem:lec11:indicator-eq" status="доказано в лекции 11"}
Для $A, B \subseteq X$: $A = B \iff 1_A = 1_B$.
:::

::: {.lemma ref="lem:lec11:powerset" status="доказано в лекции 11"}
$\mathcal{P}(X) \sim \mathbf{2}^X$. *Идея:* $A \mapsto 1_A$; прообраз функции $g$ — множество $g^{-1}[\{1\}]$.
:::

::: {.proposition ref="prop:lec11:indicator-ops" status="доказано в лекции 11"}
$1_{B \cap C} = 1_B 1_C$, $1_{B \cup C} = 1_B + 1_C - 1_B 1_C$, $1_{\overline{B}} = 1 - 1_B$; $B \subseteq C \iff 1_B \le 1_C$ всюду. *Идея:* перебор четырёх случаев; $1_B^2 = 1_B$.
:::

::: {.theorem ref="thm:lec11:tuples" status="доказано в лекции 11 (набросок)"}
$A^n \sim A^{\mathbf{n}}$ для любого $A$ и $n \in \N$. *Идея:* $f \mapsto (f(0), \dots, f(n - 1))$.
:::

::: {.definition ref="def:lec11:embedding"}
$A \lesssim B$ ($A$ вкладывается в $B$), если существует инъекция $f\colon A \to B$ (вложение); запись $A \lesssim_f B$.
:::

::: {.lemma ref="lem:lec11:embed-props" status="доказано в лекции 11"}
$A \lesssim A$; $A \lesssim B \wedge B \lesssim C \Rightarrow A \lesssim C$; $A \sim B \Rightarrow A \lesssim B \wedge B \lesssim A$; $A \lesssim B \iff \exists D \subseteq B\ A \sim D$.
:::

::: {.theorem ref="thm:lec11:csb" status="без доказательства"}
Кантор — Шрёдер — Бернштейн: если $A \lesssim B$ и $B \lesssim A$, то $A \sim B$.
:::

::: {.corollary ref="cor:lec11:powerset-not-embed" status="доказано в лекции 11"}
$\mathcal{P}(A) \not\lesssim A$ ни для какого $A$. *Идея:* $A \lesssim \mathcal{P}(A)$ через $x \mapsto \{x\}$, затем теорема Кантора — Шрёдера — Бернштейна и теорема Кантора.
:::

::: {.definition ref="def:lec11:strict"}
$A \lnsim B$, если $A \lesssim B$ и $A \nsim B$; по теореме Кантора — Шрёдера — Бернштейна это то же, что $A \lesssim B$ и $B \not\lesssim A$.
:::

::: {.definition ref="def:lec11:countable"}
$X$ счётно, если $X \sim \N$. Счётны $\N^2$, $\Z$, $\Q$; $\mathcal{P}(\N) \sim \R$ (принимается без доказательства) — нет.
:::

# Лекция 12 — Конечные множества. Основы подсчёта

::: {.definition ref="def:lec12:finite"}
$A$ конечно, если $A \sim \mathbf{n}$ для некоторого $n \in \N$; иначе бесконечно.
:::

::: {.definition ref="def:lec12:restriction"}
Сужение $f\colon A \to B$ на $X \subseteq A$: $f \restriction X = f \cap (X \times B)\colon X \to B$.
:::

::: {.lemma ref="lem:lec12:n1-n" status="доказано в лекции 12"}
Инъекции $\mathbf{n + 1} \to \mathbf{n}$ не существует. *Идея:* наименьший контрпример $n = m + 1$; переставив $f(n)$ и $m$, получаем инъекцию $\mathbf{m + 1} \to \mathbf{m}$.
:::

::: {.theorem ref="thm:lec12:pigeonhole" status="доказано в лекции 12"}
Принцип Дирихле: при $m > n$ никакая $f\colon \mathbf{m} \to \mathbf{n}$ не инъективна, $\mathbf{m} \not\lesssim \mathbf{n}$. *Идея:* $\mathbf{n + 1} \subseteq \mathbf{m}$.
:::

::: {.corollary ref="cor:lec12:distinct" status="доказано в лекции 12"}
$m \ne n \Rightarrow \mathbf{m} \nsim \mathbf{n}$.
:::

::: {.corollary ref="cor:lec12:unique" status="доказано в лекции 12"}
Для конечного $A$ число $n$ с $A \sim \mathbf{n}$ единственно.
:::

::: {.definition ref="def:lec12:cardinality"}
$|A|$ — единственное $n$ с $A \sim \mathbf{n}$ (мощность, число элементов конечного $A$); для конечных $A \sim B \iff |A| = |B|$.
:::

::: {.theorem ref="thm:lec12:no-surjection" status="доказано в лекции 12"}
При $m > n$ никакая $f\colon \mathbf{n} \to \mathbf{m}$ не сюръективна. *Идея:* наименьший прообраз даёт инъекцию $\mathbf{m} \to \mathbf{n}$.
:::

::: {.lemma ref="lem:lec12:invariant" status="доказано в лекции 12"}
Конечность, бесконечность и счётность сохраняются при $\sim$.
:::

::: {.lemma ref="lem:lec12:countable-infinite" status="доказано в лекции 12"}
Если $A$ счётно и $A \lesssim B$, то $B$ бесконечно.
:::

::: {.lemma ref="lem:lec12:subset-n" status="доказано в лекции 12 (набросок)"}
Любое $A \subseteq \N$ конечно или счётно. *Идея:* перечислить элементы по возрастанию.
:::

::: {.corollary ref="cor:lec12:sub-countable" status="доказано в лекции 12"}
$A \lesssim B$, $B$ счётно $\Rightarrow$ $A$ конечно или счётно.
:::

::: {.corollary ref="cor:lec12:sub-finite" status="доказано в лекции 12"}
$A \lesssim B$, $B$ конечно $\Rightarrow$ $A$ конечно и $|A| \le |B|$.
:::

::: {.definition ref="def:lec12:uncountable"}
Несчётное множество — бесконечное и не счётное; конечные и счётные вместе — не более чем счётные (это ровно $A \lesssim \N$).
:::

::: {.lemma ref="lem:lec12:infinite-n" status="доказано в лекции 12 (набросок, с аксиомой выбора)"}
Если $A$ бесконечно, то $\N \lesssim A$.
:::

::: {.corollary ref="cor:lec12:infinite-iff" status="доказано в лекции 12"}
$A$ бесконечно $\iff$ $\N \lesssim A$.
:::

::: {.theorem ref="thm:lec12:sum" status="доказано в лекции 12"}
Правило суммы: для конечных $A$, $B$ с $A \cap B = \varnothing$: $|A \cup B| = |A| + |B|$. *Идея:* $h = f$ на $A$, $h = n + g$ на $B$.
:::

::: {.corollary ref="cor:lec12:union" status="доказано в лекции 12"}
Для конечных $A$, $B$: $|A \cup B| = |A| + |B| - |A \cap B|$.
:::

::: {.corollary ref="cor:lec12:union-le" status="доказано в лекции 12"}
$|A \cup B| \le |A| + |B|$.
:::

::: {.corollary ref="cor:lec12:proper" status="доказано в лекции 12"}
Если $B$ конечно и $A \subsetneq B$, то $|A| < |B|$.
:::

::: {.theorem ref="thm:lec12:product" status="доказано в лекции 12"}
Правило произведения: $|A \times B| = |A| \cdot |B|$ для конечных $A$, $B$. *Идея:* $h(x, y) = m f(x) + g(y)$ и единственность деления с остатком.
:::

::: {.corollary ref="cor:lec12:power" status="доказано в лекции 12"}
$|A^n| = |A|^n$.
:::

::: {.corollary ref="cor:lec12:functions" status="доказано в лекции 12"}
$|B^A| = |B|^{|A|}$ (с $0^0 = 1$). *Идея:* $B^A \sim \mathbf{m}^{\mathbf{n}} \sim \mathbf{m}^n$.
:::

::: {.corollary ref="cor:lec12:powerset" status="доказано в лекции 12"}
$|\mathcal{P}(A)| = 2^{|A|}$.
:::

::: {.proposition ref="prop:lec12:image-le" status="доказано в лекции 12"}
Для конечного $A$ и $f\colon A \to B$: $|f[A]| \le |A|$.
:::

::: {.theorem ref="thm:lec12:inj-surj" status="доказано в лекции 12"}
Если $A$, $B$ конечны и $|A| = |B|$, то $f\colon A \to B$ инъективна $\iff$ сюръективна. *Идея:* инъекция — образ равномощен $A$ и не может быть собственной частью $B$; сюръекция со склейкой — выброшенная точка уменьшает образ.
:::

# Глоссарий курса

::: course-glossary
:::
