---
course: discrete
lecture: 10
date: 2026-11-13
title: Объединение семейства. Алгебра множеств
---

# Контекст

В лекции 9 появились аксиомы множеств: равенство и включение, перечисление, выделение подмножества, пустое множество и булеан $\mathcal{P}(A)$ (аксиома [-@ax:lec09:powerset]); там же парадокс Рассела показал, что собирать «все множества со свойством» без объемлющего множества нельзя (лемма [-@lem:lec09:russell]). Не хватает последнего способа строить множества — объединения семейства. Из него и выделения получаются привычные операции $\cup$, $\cap$, $\setminus$ и дополнение, а их свойства — тождества алгебры множеств — оказываются переводом законов логики из лекции 1. Мы научимся доказывать такие тождества тремя способами и опровергать неверные контрпримером. <!-- TODO enrich -->

# После прочтения ты сможешь

- вычислять объединение семейства $\bigcup A$, в том числе для бесконечных семейств;
- переводить операции $\cup$, $\cap$, $\setminus$ и дополнение в логические связки и доказывать включения через произвольный элемент;
- доказывать тождества алгебры множеств поэлементно, таблицей принадлежности и цепочкой известных тождеств, а неверные тождества опровергать контрпримером;

# Теория

## Объединение семейства {#sec:lec10:union}

Перечисление, выделение и булеан из лекции 9 не позволяют «склеить» несколько множеств в одно: выделение даёт только подмножества уже имеющегося множества. Это делает последняя аксиома. <!-- TODO enrich -->

::: {.axiom #ax:lec10:union title="объединение"}
Для любого множества $A$ существует множество $\bigcup A$ такое, что для каждого $x$
$$x \in \bigcup A \iff \exists \alpha\, (x \in \alpha \wedge \alpha \in A).$$
:::

$\bigcup A$ — множество элементов элементов $A$: элементы множества $A$ мыслятся как «мешки», и $\bigcup A$ — это содержимое всех мешков, высыпанное в один.

::: {.example #ex:lec10:union}
1. $\bigcup \varnothing = \varnothing$: если $x \in \bigcup \varnothing$, то $x \in \alpha \in \varnothing$ для некоторого $\alpha$, но $\alpha \in \varnothing$ невозможно. Значит, $\bigcup \varnothing$ пусто и по следствию [-@cor:lec09:empty-unique] равно $\varnothing$.
2. $\bigcup \{A\} = A$: $x \in \bigcup\{A\} \iff \exists \alpha\, (x \in \alpha \wedge \alpha = A) \iff x \in A$ (в последнем переходе свидетель $\alpha = A$).
3. Для $A = \{\{1, 2, 3\}, \{1\}, \{2, 4\}\}$ получаем $\bigcup A = \{1, 2, 3, 4\}$. Условие $\alpha \in A$ — дизъюнкция $\alpha = \{1, 2, 3\} \vee \alpha = \{1\} \vee \alpha = \{2, 4\}$. Внеся $x \in \alpha \wedge {}$ в каждый член по дистрибутивности $P \wedge (Q \vee R) \equiv (P \wedge Q) \vee (P \wedge R)$ (обе части ложны при $[P] = 0$ и равны $[Q \vee R]$ при $[P] = 1$) и переставив $\exists$ с $\vee$ (замечание [-@rem:lec02:distribute]), получаем
$$x \in \bigcup A \iff x \in \{1, 2, 3\} \vee x \in \{1\} \vee x \in \{2, 4\} \iff x = 1 \vee x = 2 \vee x = 3 \vee x = 4.$$
:::

::: {.example #ex:lec10:segments}
Пусть $S$ — множество всех отрезков длины $1$ на прямой: $S = \{X \in \mathcal{P}(\R) \mid \exists a \in \R\ X = [a, a + 1]\}$, короче $S = \{[a, a + 1] \mid a \in \R\}$ (напомним, $[a, b] = \{x \in \R \mid a \le x \le b\}$). Покажем, что $\bigcup S = \R$.

*Решение.* Если $x \in \bigcup S$, то $x \in X \in S$ для некоторого $X$, то есть $x \in [a, a + 1]$ для некоторого $a$, и по определению отрезка $x \in \R$. Обратно, пусть $x \in \R$. Отрезок $[x, x + 1] \in S$ содержит $x$, поэтому $x \in \bigcup S$ (рис. [-@fig:lec10:segments]). Такой отрезок не единственный: подходят и $[x - \frac12, x + \frac12]$, и бесконечно много других. Итак, объединение множества отрезков, каждый из которых ограничен, — вся прямая.
:::

```{.tikz #fig:lec10:segments caption="Несколько элементов семейства $S = \\{[a, a + 1] \mid a \in \R\\}$; каждая точка $x$ прямой покрыта, например, отрезками $[x, x + 1]$ и $[x - \frac12, x + \frac12]$, поэтому $\bigcup S = \R$"}
\begin{tikzpicture}[x=1.4cm, seg/.style={very thick, nbblue, {Bracket[]}-{Bracket[]}}]
  \draw[-{Stealth}] (-3.3,0) -- (4.3,0) node[right] {$\R$};
  \foreach \t in {-3,-2,-1,0,1,2,3,4} { \draw (\t,0.07) -- (\t,-0.07) node[below] {\small $\t$}; }
  \draw[seg] (-2.6,0.5) -- (-1.6,0.5);
  \draw[seg] (-1.2,0.9) -- (-0.2,0.9);
  \draw[seg] (0.3,0.5) -- (1.3,0.5);
  \draw[seg] (2.1,0.9) -- (3.1,0.9);
  \fill[nbred] (1.7,0) circle (2pt) node[below=3pt] {$x$};
  \draw[seg, nbred] (1.7,1.5) -- (2.7,1.5) node[right, font=\small] {$[x, x + 1]$};
  \draw[seg, nborange] (1.2,1.9) -- (2.2,1.9) node[right, font=\small] {$[x - \frac12, x + \frac12]$};
  \draw[aux] (1.7,0) -- (1.7,1.9);
\end{tikzpicture}
```

::: {.example #ex:lec10:union-mono}
Если $X \subseteq Y$, то $\bigcup X \subseteq \bigcup Y$.

*Решение.* Возьмём произвольное $a \in \bigcup X$: $a \in \alpha$ для некоторого $\alpha \in X$. Так как $X \subseteq Y$, то $\alpha \in Y$, и $\alpha$ — свидетель того, что $a \in \bigcup Y$.
:::

## Алгебра множеств {#sec:lec10:algebra}

Объединение двух множеств — частный случай объединения семейства.

::: {.definition #def:lec10:operations title="объединение, пересечение, разность"}
Для множеств $A$ и $B$:

- *объединение* $A \cup B := \bigcup \{A, B\}$;
- *пересечение* $A \cap B := \{x \in A \mid x \in B\}$;
- *разность* $A \setminus B := \{x \in A \mid x \notin B\}$.

Множество $A$ *пересекается* с $B$, если $A \cap B \ne \varnothing$; иначе $A$ и $B$ *не пересекаются* (disjoint).
:::

Из определений: для каждого $x$
$$x \in A \cup B \iff x \in A \vee x \in B, \quad x \in A \cap B \iff x \in A \wedge x \in B, \quad x \in A \setminus B \iff x \in A \wedge x \notin B.$$
Два последних — прямо аксиома выделения, первое получается так же, как в примере [-@ex:lec10:union] (пункт 3): $x \in \bigcup\{A, B\} \iff \exists \alpha\, (x \in \alpha \wedge (\alpha = A \vee \alpha = B)) \iff x \in A \vee x \in B$.

Операции над множествами — это связки над утверждениями о принадлежности: $\cup$ — это $\vee$, $\cap$ — это $\wedge$, $\setminus$ — это «и не».

::: {.lemma #lem:lec10:basic-incl title="простейшие включения"}
Для любых $A$, $B$: $A \cap B \subseteq A \subseteq A \cup B$ и $A \cap B \subseteq B \subseteq A \cup B$; $A \setminus B \subseteq A$ и $(A \setminus B) \cap B = \varnothing$.
:::

::: proof
Каждое включение — тавтология о принадлежности: например, $x \in A \wedge x \in B \to x \in A$ и $x \in A \to x \in A \vee x \in B$ истинны при любых значениях. Последнее: если $x \in (A \setminus B) \cap B$, то $x \notin B$ и $x \in B$ — противоречие, значит, элементов нет.
:::

::: {.lemma #lem:lec10:subset-equiv title="три формы включения"}
Для любых множеств $A$ и $B$ равносильны: (1) $A \subseteq B$; (2) $A \cap B = A$; (3) $A \cup B = B$.
:::

Пример: $\{1\} \subseteq \{1, 2\}$, и действительно $\{1\} \cap \{1, 2\} = \{1\}$, $\{1\} \cup \{1, 2\} = \{1, 2\}$.

::: proof
*Идея:* доказываем по кругу (1) $\Rightarrow$ (2) $\Rightarrow$ (3) $\Rightarrow$ (1) — три импликации вместо шести.

(1) $\Rightarrow$ (2). По лемме [-@lem:lec10:basic-incl] $A \cap B \subseteq A$. Обратно, если $x \in A$, то $x \in B$ (так как $A \subseteq B$), значит, $x \in A \cap B$. По лемме [-@lem:lec09:subset] $A \cap B = A$.

(2) $\Rightarrow$ (3). По лемме [-@lem:lec10:basic-incl] $B \subseteq A \cup B$. Обратно, пусть $x \in A \cup B$, то есть $x \in A$ или $x \in B$. Если $x \in A$, то из $A = A \cap B$ получаем $x \in A \cap B$, откуда $x \in B$. Если $x \in B$, доказывать нечего.

(3) $\Rightarrow$ (1). По лемме [-@lem:lec10:basic-incl] $A \subseteq A \cup B$, а $A \cup B = B$.
:::

Часто все рассматриваемые множества — подмножества одного фиксированного множества $U$. Его называют *универсальным множеством* или *универсумом* (universe) — для данной задачи; например, в задачах о множествах чисел $U = \R$.

::: {.definition #def:lec10:complement title="дополнение"}
Если универсум $U$ задан (или ясен из контекста), то для $A \subseteq U$ *дополнение* $A$ (до $U$) — это $\bar A := U \setminus A$.
:::

Сразу $A \setminus B = A \cap \bar B$ для всех $A, B \subseteq U$: обе части состоят из $x \in U$ с $x \in A$ и $x \notin B$. Дополнение зависит от универсума: дополнение множества чётных чисел до $\N$ — нечётные натуральные, а до $\Z$ — все нечётные целые. Поэтому без универсума запись $\bar A$ смысла не имеет. Наглядно операции изображают *диаграммами Эйлера* (рис. [-@fig:lec10:euler]): множества — фигуры на плоскости, элементы — точки. Диаграммы полезны, чтобы угадать ответ или найти контрпример, но никакая диаграмма ничего не доказывает.

```{.tikz #fig:lec10:euler caption="Диаграммы Эйлера для операций над множествами $A, B \subseteq U$; закрашен результат операции"}
\begin{tikzpicture}[set/.style={draw, thick}, sh/.style={fill=nbblue!35}]
  \def\A{(-0.38,0) circle (0.62)}
  \def\B{(0.38,0) circle (0.62)}
  \begin{scope}
    \fill[sh] \A; \fill[sh] \B;
    \draw[set] \A; \draw[set] \B; \draw (-1.4,-0.85) rectangle (1.4,0.85);
    \node at (-0.98,0.66) {\small $A$}; \node at (0.98,0.66) {\small $B$}; \node at (-1.22,-0.66) {\small $U$};
    \node at (0,-1.15) {$A \cup B$};
  \end{scope}
  \begin{scope}[xshift=3.15cm]
    \begin{scope} \clip \A; \fill[sh] \B; \end{scope}
    \draw[set] \A; \draw[set] \B; \draw (-1.4,-0.85) rectangle (1.4,0.85);
    \node at (-0.98,0.66) {\small $A$}; \node at (0.98,0.66) {\small $B$}; \node at (-1.22,-0.66) {\small $U$};
    \node at (0,-1.15) {$A \cap B$};
  \end{scope}
  \begin{scope}[xshift=6.3cm]
    \fill[sh] \A; \fill[white] \B;
    \draw[set] \A; \draw[set] \B; \draw (-1.4,-0.85) rectangle (1.4,0.85);
    \node at (-0.98,0.66) {\small $A$}; \node at (0.98,0.66) {\small $B$}; \node at (-1.22,-0.66) {\small $U$};
    \node at (0,-1.15) {$A \setminus B = A \cap \bar B$};
  \end{scope}
  \begin{scope}[xshift=9.45cm]
    \fill[sh] (-1.4,-0.85) rectangle (1.4,0.85);
    \fill[white] (0,0) circle (0.62);
    \draw[set] (0,0) circle (0.62); \draw (-1.4,-0.85) rectangle (1.4,0.85);
    \node at (0,0) {\small $A$}; \node at (-1.22,-0.66) {\small $U$};
    \node at (0,-1.15) {$\bar A = U \setminus A$};
  \end{scope}
\end{tikzpicture}
```

::: {.theorem #thm:lec10:identities title="тождества алгебры множеств"}
Для любого множества $U$ и любых $A, B, C \subseteq U$:

1. $A \cap B = B \cap A$, $A \cup B = B \cup A$ (коммутативность);
2. $(A \cap B) \cap C = A \cap (B \cap C)$, $(A \cup B) \cup C = A \cup (B \cup C)$ (ассоциативность);
3. $A \cap A = A$, $A \cup A = A$ (идемпотентность);
4. $A \cap (A \cup B) = A$, $A \cup (A \cap B) = A$ (поглощение);
5. $\bar{\bar A} = A$ (двойное дополнение);
6. $A \cap (B \cup C) = (A \cap B) \cup (A \cap C)$, $A \cup (B \cap C) = (A \cup B) \cap (A \cup C)$ (дистрибутивность);
7. $\overline{A \cap B} = \bar A \cup \bar B$, $\overline{A \cup B} = \bar A \cap \bar B$ (законы де Моргана);
8. $A \cap \varnothing = \varnothing$, $A \cup \varnothing = A$, $A \cap U = A$, $A \cup U = U$, $\bar\varnothing = U$, $\bar U = \varnothing$;
9. $A \cap \bar A = \varnothing$, $A \cup \bar A = U$.
:::

Проверим на примере: $U = \{1, 2, 3, 4\}$, $A = \{1, 2\}$, $B = \{2, 3\}$. Тогда $\overline{A \cap B} = \overline{\{2\}} = \{1, 3, 4\}$ и $\bar A \cup \bar B = \{3, 4\} \cup \{1, 4\} = \{1, 3, 4\}$ — первый закон де Моргана.

::: proof
*Идея:* каждое тождество — это логическая эквивалентность, переписанная на язык принадлежности.

Обе части каждого тождества — подмножества $U$, поэтому достаточно сравнить их на элементах $x \in U$. Для такого $x$ обозначим через $\alpha$, $\beta$, $\gamma$ высказывания «$x \in A$», «$x \in B$», «$x \in C$». По формулам после определения [-@def:lec10:operations] высказывание $x \in A \cap B$ равносильно $\alpha \wedge \beta$, $x \in A \cup B$ — $\alpha \vee \beta$, $x \in \bar A$ — $\neg\alpha$; высказывание $x \in \varnothing$ ложно, $x \in U$ истинно. Поэтому тождество верно, если формулы, соответствующие его частям, логически эквивалентны. Например, для первого закона де Моргана при $x \in U$:
$$x \in \overline{A \cap B} \iff \neg(x \in A \wedge x \in B) \iff x \notin A \vee x \notin B \iff x \in \bar A \cup \bar B$$
по закону де Моргана для связок (утверждение [-@prop:lec01:laws]). Так же пункты 1, 2, 5, 7 следуют из коммутативности, ассоциативности, снятия двойного отрицания и законов де Моргана в утверждении [-@prop:lec01:laws]. Пункты 8, 9 — из того, что конъюнкция с ложным высказыванием ложна, дизъюнкция с истинным истинна, $\alpha \wedge \neg\alpha$ всегда ложно, а $\alpha \vee \neg\alpha$ всегда истинно.

Оставшиеся эквивалентности $\alpha \wedge \alpha \equiv \alpha$, $\alpha \wedge (\alpha \vee \beta) \equiv \alpha$, $\alpha \wedge (\beta \vee \gamma) \equiv (\alpha \wedge \beta) \vee (\alpha \wedge \gamma)$ и двойственные к ним проверим через утверждение [-@prop:lec01:arith]: значение $\wedge$ — минимум, $\vee$ — максимум значений; ниже буквами $\alpha$, $\beta$, $\gamma$ обозначены сами значения $0$ или $1$. Например, для дистрибутивности $\min(\alpha, \max(\beta, \gamma)) = \max(\min(\alpha, \beta), \min(\alpha, \gamma))$: при $\alpha = 0$ обе части равны $0$, при $\alpha = 1$ обе равны $\max(\beta, \gamma)$. Остальные проверяются так же перебором значения $\alpha$.
:::

::: {.remark #rem:lec10:parens}
Из ассоциативности следует, что в выражениях $A_1 \cap A_2 \cap \ldots \cap A_n$ и $A_1 \cup \ldots \cup A_n$ скобки можно опускать: при любой расстановке получается одно и то же множество. Для разности это неверно: $A \setminus (B \setminus C)$ и $(A \setminus B) \setminus C$, вообще говоря, различны (задача [-@prob:lec10:identities]).
:::

### Метод: таблица принадлежности

Доказательство теоремы [-@thm:lec10:identities] даёт и общий способ проверять любое тождество, составленное из $\cup$, $\cap$, $\setminus$ и дополнения: элемент $x \in U$ может лежать или не лежать в каждом из множеств $A$, $B$, $C$ — всего $2^3 = 8$ вариантов. На диаграмме Эйлера трёх множеств это восемь областей (рис. [-@fig:lec10:regions], слева). Тождество верно тогда и только тогда, когда обе части дают одинаковый результат во всех восьми строках таблицы — это та же таблица истинности из лекции 1. Строка, в которой части различаются, сразу даёт контрпример: достаточно положить $U = \{x\}$ и включить $x$ в те множества, где в строке стоит $1$.

::: {.example #ex:lec10:identity}
Докажите, что $A \setminus (B \setminus C) = (A \setminus B) \cup (A \cap C)$, двумя способами: цепочкой тождеств и таблицей принадлежности.

*Ответ:* тождество верно; обе части — объединение областей $100$, $101$, $111$ на рис. [-@fig:lec10:regions].

*Решение цепочкой.* В качестве универсума возьмём $U = A \cup B \cup C$ (при доказательстве тождеств дополнение часто используют без пояснений, подразумевая такой универсум). По $A \setminus B = A \cap \bar B$ и теореме [-@thm:lec10:identities]:
$$A \setminus (B \setminus C) = A \cap \overline{B \cap \bar C} = A \cap (\bar B \cup \bar{\bar C}) = A \cap (\bar B \cup C) = (A \cap \bar B) \cup (A \cap C) = (A \setminus B) \cup (A \cap C).$$
Шаги: закон де Моргана, двойное дополнение, дистрибутивность, снова $A \cap \bar B = A \setminus B$.

*Решение таблицей.* Столбцы $\alpha$, $\beta$, $\gamma$ — принадлежность $x$ множествам $A$, $B$, $C$:

| $\alpha\beta\gamma$ | $B \setminus C$ | $A \setminus (B \setminus C)$ | $A \setminus B$ | $A \cap C$ | $(A \setminus B) \cup (A \cap C)$ |
|:-:|:-:|:-:|:-:|:-:|:-:|
| $000$ | $0$ | $0$ | $0$ | $0$ | $0$ |
| $001$ | $0$ | $0$ | $0$ | $0$ | $0$ |
| $010$ | $1$ | $0$ | $0$ | $0$ | $0$ |
| $011$ | $0$ | $0$ | $0$ | $0$ | $0$ |
| $100$ | $0$ | $1$ | $1$ | $0$ | $1$ |
| $101$ | $0$ | $1$ | $1$ | $1$ | $1$ |
| $110$ | $1$ | $0$ | $0$ | $0$ | $0$ |
| $111$ | $0$ | $1$ | $0$ | $1$ | $1$ |

Третий и последний столбцы совпадают во всех строках. Цепочка короче, когда видно, какие тождества применять; таблица работает всегда, механически, и в случае неверного тождества сама показывает контрпример.
:::

```{.tikz #fig:lec10:regions caption="Слева: восемь областей диаграммы трёх множеств, область подписана строкой $\alpha\beta\gamma$ принадлежности $A$, $B$, $C$. Справа: закрашено $A \setminus (B \setminus C)$ — области $100$, $101$, $111$"}
\begin{tikzpicture}[scale=0.85, set/.style={draw, thick}, rl/.style={font=\scriptsize}]
  \def\A{(-0.5,0.3) circle (1)}
  \def\B{(0.5,0.3) circle (1)}
  \def\C{(0,-0.5) circle (1)}
  \draw (-2.1,-1.75) rectangle (2.1,1.55);
  \draw[set] \A; \draw[set] \B; \draw[set] \C;
  \node at (-1.35,1.05) {$A$}; \node at (1.35,1.05) {$B$}; \node at (0.95,-1.35) {$C$};
  \node[rl] at (-1.0,0.55) {100}; \node[rl] at (1.0,0.55) {010}; \node[rl] at (0,-1.1) {001};
  \node[rl] at (0,0.8) {110}; \node[rl] at (-0.62,-0.35) {101}; \node[rl] at (0.62,-0.35) {011};
  \node[rl] at (0,0.02) {111}; \node[rl] at (-1.75,-1.45) {000};
  \begin{scope}[xshift=5.6cm]
    \fill[nbblue!35] \A; \fill[white] \B;
    \begin{scope} \clip \A; \fill[nbblue!35] \C; \end{scope}
    \draw (-2.1,-1.75) rectangle (2.1,1.55);
    \draw[set] \A; \draw[set] \B; \draw[set] \C;
    \node at (-1.35,1.05) {$A$}; \node at (1.35,1.05) {$B$}; \node at (0.95,-1.35) {$C$};
    \node[rl] at (-1.0,0.55) {100}; \node[rl] at (-0.62,-0.35) {101}; \node[rl] at (0,0.02) {111};
  \end{scope}
\end{tikzpicture}
```

::: {.remark #rem:lec10:minus tag="частое заблуждение"}
«*$(A \cup B) \setminus B = A$: добавили $B$ и убрали $B$ — как $(a + b) - b = a$.*» Нет: при $A = B = \{1\}$ слева $\{1\} \setminus \{1\} = \varnothing$, а справа $\{1\}$. Объединение «склеивает» общие элементы: элементы $A \cap B$ при вычитании $B$ уходят вместе с $B$. Верно $(A \cup B) \setminus B = A \setminus B$, и это равно $A$ ровно тогда, когда $A \cap B = \varnothing$.
:::

Тождества и лемму [-@lem:lec10:subset-equiv] можно комбинировать.

::: {.example #ex:lec10:sup}
Если $A \subseteq C$ и $B \subseteq C$, то $A \cup B \subseteq C$.

*Решение поэлементно.* Пусть $x \in A \cup B$. Если $x \in A$, то $x \in C$, так как $A \subseteq C$; если $x \in B$ — так как $B \subseteq C$.

*Решение через тождества.* $C = A \cup C = A \cup (B \cup C) = (A \cup B) \cup C$, и по лемме [-@lem:lec10:subset-equiv] $A \cup B \subseteq C$.

Итак, $A \cup B$ — наименьшее множество, содержащее и $A$, и $B$. Двойственное утверждение для пересечения — в самопроверке.
:::

# Практика

::: {.problem #prob:lec10:union-in-diff}
Может ли быть так, что $A \cup B \in A \setminus B$?
:::

::: answer
Нет, ни при каких $A$, $B$.
:::

::: solution
*Ключ:* если $x \in A$ и $A \subseteq C$, то $x \in C$ — принадлежность «переносится» на надмножество. Пусть $A \cup B \in A \setminus B$. Тогда, в частности, $A \cup B \in A$. По лемме [-@lem:lec10:basic-incl] $A \subseteq A \cup B$, поэтому $A \cup B \in A \cup B$. Это противоречит утверждению [-@prop:lec09:not-self]: множество не может быть своим элементом. Условие $A \cup B \notin B$ даже не понадобилось.
:::

::: {.problem #prob:lec10:powerset-ops}
a) Всегда ли $\mathcal{P}(A \cap B) = \mathcal{P}(A) \cap \mathcal{P}(B)$?
b) Всегда ли $\mathcal{P}(A \cup B) = \mathcal{P}(A) \cup \mathcal{P}(B)$?
:::

::: answer
a) Да, всегда.
b) Нет: верно только $\mathcal{P}(A) \cup \mathcal{P}(B) \subseteq \mathcal{P}(A \cup B)$; равенство выполнено тогда и только тогда, когда $A \subseteq B$ или $B \subseteq A$. Контрпример: $A = \{1\}$, $B = \{2\}$.
:::

::: solution
a) Для каждого $X$: $X \in \mathcal{P}(A \cap B) \iff X \subseteq A \cap B \iff X \subseteq A \wedge X \subseteq B \iff X \in \mathcal{P}(A) \cap \mathcal{P}(B)$. *Ключ:* средний переход — «$X \subseteq A \cap B$ тогда и только тогда, когда каждый элемент $X$ лежит и в $A$, и в $B$» ($\forall$ переставляется с $\wedge$, замечание [-@rem:lec02:distribute]).

b) *Ключ:* для объединения переход не работает — $\forall$ не переставляется с $\vee$: «каждый элемент $X$ лежит в $A$ или в $B$» не означает «все в $A$ или все в $B$». При $A = \{1\}$, $B = \{2\}$ множество $\{1, 2\} \in \mathcal{P}(A \cup B)$, но $\{1, 2\} \notin \mathcal{P}(A) \cup \mathcal{P}(B) = \{\varnothing, \{1\}, \{2\}\}$. Включение $\mathcal{P}(A) \cup \mathcal{P}(B) \subseteq \mathcal{P}(A \cup B)$ верно по транзитивности включения. Если $A \subseteq B$, обе части равны $\mathcal{P}(B)$ (так как $\mathcal{P}(A) \subseteq \mathcal{P}(B)$). Обратно, из равенства и $A \cup B \in \mathcal{P}(A \cup B)$ следует $A \cup B \in \mathcal{P}(A)$ или $A \cup B \in \mathcal{P}(B)$, то есть $B \subseteq A$ или $A \subseteq B$.
:::

::: {.problem #prob:lec10:symdiff}
*Симметрической разностью* множеств $A$ и $B$ называется $A \mathbin{\triangle} B := (A \setminus B) \cup (B \setminus A)$. Пусть $n \ge 2$. Всегда ли верно, что
$$(A_1 \cup \ldots \cup A_n) \mathbin{\triangle} (B_1 \cup \ldots \cup B_n) \subseteq (A_1 \mathbin{\triangle} B_1) \cup \ldots \cup (A_n \mathbin{\triangle} B_n)?$$
:::

::: answer
Да, всегда.
:::

::: solution
$A \mathbin{\triangle} B$ — элементы, лежащие ровно в одном из двух множеств. Обозначим $A = A_1 \cup \ldots \cup A_n$, $B = B_1 \cup \ldots \cup B_n$ и возьмём произвольный $x \in A \mathbin{\triangle} B$. Пусть, например, $x \in A$ и $x \notin B$ (второй случай, $x \in B \setminus A$, симметричен). *Ключ:* из $x \in A$ следует $x \in A_i$ для некоторого $i$, а из $x \notin B$ — что $x \notin B_j$ для *всех* $j$, в частности $x \notin B_i$ для того же $i$. Значит, $x \in A_i \setminus B_i \subseteq A_i \mathbin{\triangle} B_i$, и $x$ лежит в правой части. Обратное включение, вообще говоря, неверно: при $n = 2$, $A_1 = B_2 = \{1\}$, $A_2 = B_1 = \varnothing$ левая часть $\{1\} \mathbin{\triangle} \{1\} = \varnothing$, а правая $\{1\} \cup \{1\} = \{1\}$.
:::

::: {.problem #prob:lec10:identities}
Докажите или опровергните: a) $(A \setminus B) \setminus C = A \setminus (B \cup C)$; b) $A \setminus (B \setminus C) = (A \setminus B) \setminus C$.
:::

::: answer
a) Верно.
b) Неверно: при $A = C = \{1\}$, $B = \varnothing$ слева $\{1\}$, справа $\varnothing$.
:::

::: solution
a) Поэлементно: $x \in (A \setminus B) \setminus C \iff x \in A \wedge x \notin B \wedge x \notin C \iff x \in A \wedge \neg(x \in B \vee x \in C) \iff x \in A \setminus (B \cup C)$ (закон де Моргана). Цепочкой: $(A \cap \bar B) \cap \bar C = A \cap (\bar B \cap \bar C) = A \cap \overline{B \cup C}$.

b) *Ключ:* по таблице принадлежности (пример [-@ex:lec10:identity]) левая часть — области $100$, $101$, $111$, а правая $(A \setminus B) \setminus C$ — только область $100$. Расходятся, например, в строке $101$: $x \in A$, $x \notin B$, $x \in C$. Отсюда контрпример $U = \{1\}$, $A = C = \{1\}$, $B = \varnothing$: $A \setminus (B \setminus C) = \{1\} \setminus \varnothing = \{1\}$, а $(A \setminus B) \setminus C = \{1\} \setminus \{1\} = \varnothing$. Поэтому в «$A \setminus B \setminus C$» скобки опускать нельзя (замечание [-@rem:lec10:parens]).
:::

::: {.problem #prob:lec10:union-power}
Докажите, что $\bigcup \mathcal{P}(A) = A$ и $A \subseteq \mathcal{P}(\bigcup A)$. Верно ли, что $\mathcal{P}(\bigcup A) = A$ для любого $A$?
:::

::: answer
Оба утверждения верны; $\mathcal{P}(\bigcup A) = A$ в общем случае неверно: при $A = \{\{1\}\}$ получаем $\mathcal{P}(\bigcup A) = \{\varnothing, \{1\}\} \ne A$. Равенство выполнено тогда и только тогда, когда $A = \mathcal{P}(Y)$ для некоторого $Y$.
:::

::: solution
$\bigcup \mathcal{P}(A) = A$. «$\subseteq$»: если $x \in \bigcup \mathcal{P}(A)$, то $x \in \alpha$ для некоторого $\alpha \in \mathcal{P}(A)$, то есть $\alpha \subseteq A$, откуда $x \in A$. «$\supseteq$»: если $x \in A$, то свидетель — $\alpha = A$: $x \in A$ и $A \in \mathcal{P}(A)$. *Ключ:* в $\mathcal{P}(A)$ всегда есть само $A$ — самый большой «мешок».

$A \subseteq \mathcal{P}(\bigcup A)$: пусть $\alpha \in A$. Каждый элемент $x \in \alpha$ лежит в $\bigcup A$ (свидетель — $\alpha$), значит, $\alpha \subseteq \bigcup A$, то есть $\alpha \in \mathcal{P}(\bigcup A)$.

Для $A = \{\{1\}\}$: $\bigcup A = \{1\}$ (пример [-@ex:lec10:union]), $\mathcal{P}(\{1\}) = \{\varnothing, \{1\}\}$, а $\varnothing \notin A$, так что здесь включение строгое. Равенство бывает ровно при $A = \mathcal{P}(Y)$: тогда по доказанному $\bigcup A = Y$ и $\mathcal{P}(\bigcup A) = A$ (например, $A = \{\varnothing\} = \mathcal{P}(\varnothing)$); обратно, если $\mathcal{P}(\bigcup A) = A$, то $A = \mathcal{P}(Y)$ при $Y = \bigcup A$.
:::

# Итоги

- Объединение семейства $\bigcup A$ состоит из элементов элементов $A$; из него и выделения получаются $A \cup B$, $A \cap B$ и $A \setminus B$.
- Равенство множеств доказывают двумя включениями, а включение — через произвольный элемент; операции $\cup$, $\cap$, $\setminus$ и дополнение переводят эти рассуждения в логику $\vee$, $\wedge$, «и не», $\neg$.
- Любое тождество алгебры множеств проверяется таблицей принадлежности из $2^k$ строк, а строка, где части расходятся, даёт контрпример: $(A \cup B) \setminus B = A \setminus B$, а не $A$.

# Глоссарий

$\bigcup A$ (объединение семейства)
:   множество элементов элементов $A$: $x \in \bigcup A \iff \exists \alpha\, (x \in \alpha \in A)$; [-@ax:lec10:union].

$A \cup B$, $A \cap B$, $A \setminus B$; непересекающиеся множества
:   объединение $\bigcup\{A, B\}$, пересечение $\{x \in A \mid x \in B\}$, разность $\{x \in A \mid x \notin B\}$; $A$ и $B$ не пересекаются, если $A \cap B = \varnothing$; [-@def:lec10:operations].

Универсум $U$; дополнение $\bar A$
:   объемлющее множество задачи; $\bar A = U \setminus A$; [-@def:lec10:complement].

Диаграмма Эйлера
:   множества — фигуры на плоскости; ничего не доказывает; [-@fig:lec10:euler].

Таблица принадлежности
:   проверка тождества по $2^k$ вариантам принадлежности; [-@ex:lec10:identity].

$A \mathbin{\triangle} B$ (симметрическая разность)
:   $(A \setminus B) \cup (B \setminus A)$ — элементы ровно одного из множеств; [-@prob:lec10:symdiff].

# Самопроверка

1. Найдите $\bigcup \{\{1, 2\}, \{2, 3\}, \varnothing\}$.
2. Докажите, что не существует множества $S$, содержащего все одноэлементные множества.
3. Докажите, что если $C \subseteq A$ и $C \subseteq B$, то $C \subseteq A \cap B$.
4. Докажите или опровергните: $(A \cup B) \setminus C = A \cup (B \setminus C)$.

::: answers
1. $\{1, 2, 3\}$: пустое множество ничего не добавляет.
2. Тогда $\bigcup S$ содержало бы каждое множество $x$, так как $x \in \{x\} \in S$, — противоречие со следствием [-@cor:lec09:no-universal].
3. Пусть $x \in C$; тогда $x \in A$ и $x \in B$, то есть $x \in A \cap B$. Через тождества: $C = C \cap A$, $C = C \cap B$, откуда $C = C \cap (A \cap B)$, и по лемме [-@lem:lec10:subset-equiv] $C \subseteq A \cap B$.
4. Неверно: при $A = C = \{1\}$, $B = \varnothing$ слева $\varnothing$, справа $\{1\}$ (строка $101$ таблицы принадлежности).
:::
