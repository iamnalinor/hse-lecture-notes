---
course: discrete
lecture: 10
date: 2026-11-13
title: Объединение семейства. Алгебра множеств
---

# Контекст

Лекция 9 закончилась булеаном $\mathcal{P}(A)$ (аксиома [-@ax:lec09:powerset]); до этого были перечисление и выделение подмножества, а парадокс Рассела показал, что собирать «все множества со свойством» без объемлющего множества нельзя (лемма [-@lem:lec09:russell]). Этих способов не хватает, чтобы соединить уже имеющиеся множества в одно: выделение даёт только подмножества данного множества, перечисление — только конечные множества. Эта лекция добавляет последний способ — объединение семейства; из него и выделения получаются привычные $\cup$, $\cap$, $\setminus$ и дополнение, а их свойства — тождества алгебры множеств — оказываются законами логики из лекции 1, переписанными на язык принадлежности. Мы научимся доказывать такие тождества тремя способами (поэлементно, таблицей принадлежности, цепочкой известных тождеств) и опровергать неверные контрпримером.

# После прочтения ты сможешь

- вычислять объединение семейства $\bigcup A$, в том числе повторное $\bigcup\bigcup A$ и объединение бесконечного семейства отрезков;
- переводить операции $\cup$, $\cap$, $\setminus$ и дополнение в логические связки и доказывать включения через произвольный элемент;
- находить дополнение множества, учитывая, до какого универсума оно берётся;
- доказывать тождества алгебры множеств поэлементно, таблицей принадлежности и цепочкой известных тождеств, а неверные тождества опровергать контрпримером;
- переходить между формами включения $A \subseteq B$, $A \cap B = A$, $A \cup B = B$, $A \setminus B = \varnothing$ и доказывать включения, не разбирая элементов;
- решать задачи «может ли быть …» и «не существует множества …», сочетая операции с аксиомой основания и парадоксом Рассела.

# Теория

## Объединение семейства {#sec:lec10:union}

Перечисление, выделение и булеан из лекции 9 не позволяют «склеить» несколько множеств в одно. Попробуем построить множество, элементы которого — все натуральные числа и ещё само $\N$. Перечислением его не получить (оно бесконечно), выделением тоже: для выделения нужно множество, где уже лежат и числа, и $\N$, а такого у нас нет. Ещё пример: все отрезки длины $1$ на прямой собраны в множество $S \subseteq \mathcal{P}(\R)$ (пример [-@ex:lec10:segments] ниже), и хочется говорить о множестве точек, покрытых хотя бы одним из них. Обе задачи решает последняя аксиома: элементы множества $A$ можно «высыпать» в одно множество.

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

Вернёмся к первому вопросу раздела. Множество $\{\N, \{\N\}\}$ существует по аксиоме перечисления, и $\bigcup\{\N, \{\N\}\}$ состоит ровно из натуральных чисел и самого $\N$: $x$ лежит в нём тогда и только тогда, когда $x \in \N$ или $x \in \{\N\}$, то есть $x = \N$ (это рассуждение — пункт 3 примера [-@ex:lec10:union] в общем виде, см. формулы после определения [-@def:lec10:operations]).

::: {.remark #rem:lec10:union-level tag="подводный камень"}
$\bigcup$ спускается ровно на один уровень вложенности: элементы $\bigcup A$ — это элементы элементов $A$, а не элементы $A$. Поэтому $\bigcup A$, вообще говоря, не подмножество $A$ и не надмножество. Пусть $A = \{\{1\}\}$, тогда $\bigcup A = \{1\}$. Здесь $1 \in \bigcup A$, но $1 \notin A$ (иначе $1 = \{1\}$, что невозможно по замечанию [-@rem:lec09:singleton]), так что $\bigcup A \not\subseteq A$; и $\{1\} \in A$, но $\{1\} \notin \bigcup A$ (по той же причине), так что $A \not\subseteq \bigcup A$. И не путать $\{A, B\}$ с $\bigcup\{A, B\}$: в $\{\{1\}, \{2\}\}$ два элемента — множества $\{1\}$ и $\{2\}$, а $\bigcup\{\{1\}, \{2\}\} = \{1, 2\}$ — два числа. Повторное объединение спускается на два уровня: $\bigcup\bigcup\{\{\{1\}, \{2, 3\}\}, \{\{4\}\}\} = \bigcup\{\{1\}, \{2, 3\}, \{4\}\} = \{1, 2, 3, 4\}$.
:::

::: {.example #ex:lec10:half-open}
Пусть $\N_+ = \N \setminus \{0\}$ и $T = \{[0, 1 - \frac1n] \mid n \in \N_+\}$ — семейство отрезков $[0, 0], [0, \frac12], [0, \frac23], \dots$ Тогда $\bigcup T = [0, 1) = \{x \in \R \mid 0 \le x < 1\}$.

*Решение.* «$\subseteq$»: если $x \in [0, 1 - \frac1n]$, то $0 \le x \le 1 - \frac1n < 1$. «$\supseteq$»: пусть $0 \le x < 1$. Тогда $1 - x > 0$, и найдётся $n \in \N_+$ с $n \ge \frac{1}{1 - x}$; для него $\frac1n \le 1 - x$, то есть $x \le 1 - \frac1n$ и $x \in [0, 1 - \frac1n] \in T$.

Каждый отрезок семейства содержит свой правый конец, а объединение точку $1$ не содержит: она не лежит ни в одном отрезке. Объединение бесконечного семейства может оказаться «не того вида», что его члены: отрезки дали полуинтервал, отрезки длины $1$ в примере [-@ex:lec10:segments] — всю прямую.
:::

::: {.remark #rem:lec10:indexed title="индексная запись и пересечение семейства"}
Если множества занумерованы, $A_i$ при $i \in I$, и все они — подмножества одного $U$, то семейство $\{A_i \mid i \in I\} = \{X \in \mathcal{P}(U) \mid \exists i \in I\ X = A_i\}$ существует по аксиоме выделения, и пишут $\bigcup_{i \in I} A_i := \bigcup \{A_i \mid i \in I\}$: $x \in \bigcup_{i \in I} A_i \iff \exists i \in I\ (x \in A_i)$. Так, $\bigcup T$ из примера [-@ex:lec10:half-open] — это $\bigcup_{n \in \N_+} [0, 1 - \frac1n]$.

Для пересечения отдельной аксиомы не нужно. Если $A \ne \varnothing$, возьмём любое $\alpha_0 \in A$ и положим $\bigcap A := \{x \in \alpha_0 \mid \forall \alpha \in A\ (x \in \alpha)\}$ — элементы, лежащие во *всех* членах семейства; от выбора $\alpha_0$ результат не зависит, так как такой $x$ лежит в каждом члене. *Корнер-кейс:* $\bigcap \varnothing$ не определено: условие $\forall \alpha \in \varnothing\ (x \in \alpha)$ истинно для любого $x$, и «пересечение пустого семейства» содержало бы все множества, а такого множества нет (следствие [-@cor:lec09:no-universal]). Поэтому пересечение берут только по непустому семейству (или считают $\bigcap \varnothing = U$, если универсум задан). Пример: $\bigcap_{n \in \N_+} [-\frac1n, \frac1n] = \{0\}$.
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

Сразу $A \setminus B = A \cap \bar B$ для всех $A, B \subseteq U$: обе части состоят из $x \in U$ с $x \in A$ и $x \notin B$. Дополнение зависит от универсума: дополнение множества чётных натуральных чисел до $\N$ — нечётные натуральные, а до $\Z$ — нечётные целые вместе с отрицательными чётными. Поэтому без универсума запись $\bar A$ смысла не имеет. Наглядно операции изображают *диаграммами Эйлера* (рис. [-@fig:lec10:euler]): множества — фигуры на плоскости, элементы — точки. Диаграммы полезны, чтобы угадать ответ или найти контрпример, но никакая диаграмма ничего не доказывает.

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

::: {.remark #rem:lec10:relative-demorgan tag="подводный камень"}
Законы де Моргана верны и для разности без всякого универсума:
$$A \setminus (B \cup C) = (A \setminus B) \cap (A \setminus C), \qquad A \setminus (B \cap C) = (A \setminus B) \cup (A \setminus C).$$
Ошибка — сохранить знак операции: «$A \setminus (B \cup C) = (A \setminus B) \cup (A \setminus C)$» неверно, при $A = B = \{1\}$, $C = \varnothing$ слева $\varnothing$, справа $\{1\}$. Механизм тот же, что у отрицания: «не лежит ни в $B$, ни в $C$» — это «не в $B$ *и* не в $C$». Доказательство: положим $U = A \cup B \cup C$; тогда $A \setminus (B \cup C) = A \cap \overline{B \cup C} = A \cap \bar B \cap \bar C = (A \cap \bar B) \cap (A \cap \bar C)$ по де Моргану, ассоциативности, коммутативности и идемпотентности $A \cap A = A$; второе — так же, через дистрибутивность.
:::

Тождества и лемму [-@lem:lec10:subset-equiv] можно комбинировать.

::: {.example #ex:lec10:sup}
Если $A \subseteq C$ и $B \subseteq C$, то $A \cup B \subseteq C$.

*Решение поэлементно.* Пусть $x \in A \cup B$. Если $x \in A$, то $x \in C$, так как $A \subseteq C$; если $x \in B$ — так как $B \subseteq C$.

*Решение через тождества.* $C = A \cup C = A \cup (B \cup C) = (A \cup B) \cup C$, и по лемме [-@lem:lec10:subset-equiv] $A \cup B \subseteq C$.

Итак, $A \cup B$ — наименьшее множество, содержащее и $A$, и $B$. Двойственное утверждение для пересечения — в самопроверке.
:::

У включения есть ещё две полезные формы — через разность и через дополнения.

::: {.example #ex:lec10:subset-forms}
Для $A, B \subseteq U$ равносильны: (1) $A \subseteq B$; (4) $A \setminus B = \varnothing$; (5) $\bar B \subseteq \bar A$.

*Решение.* (1) $\Rightarrow$ (4): по лемме [-@lem:lec10:subset-equiv] $A = A \cap B$, поэтому $A \setminus B = A \cap \bar B = (A \cap B) \cap \bar B = A \cap (B \cap \bar B) = A \cap \varnothing = \varnothing$ (теорема [-@thm:lec10:identities], пункты 2, 9, 8). (4) $\Rightarrow$ (1): $A = A \cap U = A \cap (B \cup \bar B) = (A \cap B) \cup (A \cap \bar B) = (A \cap B) \cup \varnothing = A \cap B$, и по лемме [-@lem:lec10:subset-equiv] $A \subseteq B$. (1) $\Leftrightarrow$ (5): по уже доказанному $\bar B \subseteq \bar A \iff \bar B \cap \bar{\bar A} = \varnothing \iff \bar B \cap A = \varnothing \iff A \setminus B = \varnothing$.

Форма (5) — теоретико-множественный вариант контрапозиции из лекции 1: «если $x \in A$, то $x \in B$» равносильно «если $x \notin B$, то $x \notin A$». Пример: $\{1\} \subseteq \{1, 2\}$ в $U = \{1, 2, 3\}$, и действительно $\overline{\{1, 2\}} = \{3\} \subseteq \{2, 3\} = \overline{\{1\}}$.
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

::: {.problem #prob:lec10:infinite}
Найдите $\bigcup_{n \in \N_+} [\frac1n, 2]$ и $\bigcap_{n \in \N_+} I_n$, где $I_n = \{x \in \R \mid 0 < x < \frac1n\}$.
:::

::: answer
$\bigcup_{n \in \N_+} [\frac1n, 2] = \{x \in \R \mid 0 < x \le 2\}$, $\bigcap_{n \in \N_+} I_n = \varnothing$.
:::

::: solution
Объединение. «$\subseteq$»: если $\frac1n \le x \le 2$, то $0 < x \le 2$. «$\supseteq$»: пусть $0 < x \le 2$. *Ключ:* подобрать номер под $x$ — возьмём $n \in \N_+$ с $n \ge \frac1x$; тогда $\frac1n \le x$, и $x \in [\frac1n, 2]$. Точка $0$ не лежит ни в одном отрезке, поэтому в объединение не входит.

Пересечение (замечание [-@rem:lec10:indexed]; семейство непусто). Пусть $x$ лежит во всех $I_n$. Из $x \in I_1$ получаем $x > 0$; но тогда для $n \in \N_+$ с $n \ge \frac1x$ имеем $x \ge \frac1n$, и $x \notin I_n$ — противоречие. Каждое $I_n$ непусто, и любые несколько из них имеют общую точку (множество с наибольшим номером лежит во всех остальных), а пересечение всех пусто.
:::

::: {.problem #prob:lec10:disjoint-diff}
Докажите, что $A \setminus B = A$ тогда и только тогда, когда $A$ и $B$ не пересекаются, двумя способами: через произвольный элемент и через тождества.
:::

::: answer
Верно.
:::

::: solution
*Поэлементно.* «$\Rightarrow$»: пусть $A \setminus B = A$ и $x \in A \cap B$. Тогда $x \in A = A \setminus B$, то есть $x \notin B$, — противоречие с $x \in B$; значит, $A \cap B = \varnothing$. «$\Leftarrow$»: $A \setminus B \subseteq A$ по лемме [-@lem:lec10:basic-incl]; обратно, если $x \in A$, то $x \notin B$ (иначе $x \in A \cap B = \varnothing$), и $x \in A \setminus B$.

*Через тождества* (универсум $U = A \cup B$). *Ключ:* разложить $A$ на две части, «в $B$» и «вне $B$»: $A = A \cap U = A \cap (B \cup \bar B) = (A \cap B) \cup (A \setminus B)$. «$\Leftarrow$»: при $A \cap B = \varnothing$ получаем $A = \varnothing \cup (A \setminus B) = A \setminus B$. «$\Rightarrow$»: при $A \setminus B = A$ имеем $A \cap B = (A \setminus B) \cap B = \varnothing$ по лемме [-@lem:lec10:basic-incl].
:::

# Итоги

- Объединение семейства $\bigcup A$ состоит из элементов элементов $A$ — на уровень глубже, чем $A$; из него и выделения получаются $A \cup B$, $A \cap B$ и $A \setminus B$, а пересечение $\bigcap A$ определено только для непустого $A$.
- Объединение бесконечного семейства может быть множеством другого вида, чем его члены: отрезки $[0, 1 - \frac1n]$ дают полуинтервал $[0, 1)$.
- Операции $\cup$, $\cap$, $\setminus$ и дополнение — это связки $\vee$, $\wedge$, «и не», $\neg$ над утверждениями о принадлежности, поэтому каждое тождество алгебры множеств — переписанная логическая эквивалентность из лекции 1.
- Дополнение имеет смысл только относительно универсума: у чётных натуральных чисел оно разное в $\N$ и в $\Z$.
- Любое тождество алгебры множеств проверяется таблицей принадлежности из $2^k$ строк, а строка, где части расходятся, даёт контрпример: $(A \cup B) \setminus B = A \setminus B$, а не $A$.
- Включение $A \subseteq B$ можно заменить равенством ($A \cap B = A$, $A \cup B = B$, $A \setminus B = \varnothing$) и дальше работать тождествами, не разбирая элементов.
- При вычитании объединения или пересечения операция меняется на двойственную: $A \setminus (B \cup C) = (A \setminus B) \cap (A \setminus C)$.

# Глоссарий

$\bigcup A$ (объединение семейства)
:   множество элементов элементов $A$: $x \in \bigcup A \iff \exists \alpha\, (x \in \alpha \in A)$; [-@ax:lec10:union].

$\bigcup_{i \in I} A_i$; $\bigcap A$ (пересечение семейства)
:   $\bigcup\{A_i \mid i \in I\}$; $\bigcap A$ — элементы, лежащие во всех членах непустого семейства $A$; $\bigcap \varnothing$ не определено; [-@rem:lec10:indexed].

$A \cup B$, $A \cap B$, $A \setminus B$; непересекающиеся множества
:   объединение $\bigcup\{A, B\}$, пересечение $\{x \in A \mid x \in B\}$, разность $\{x \in A \mid x \notin B\}$; $A$ и $B$ не пересекаются, если $A \cap B = \varnothing$; [-@def:lec10:operations].

Универсум $U$; дополнение $\bar A$
:   объемлющее множество задачи; $\bar A = U \setminus A$; [-@def:lec10:complement].

Диаграмма Эйлера
:   множества — фигуры на плоскости; ничего не доказывает; [-@fig:lec10:euler].

Законы де Моргана для разности
:   $A \setminus (B \cup C) = (A \setminus B) \cap (A \setminus C)$, $A \setminus (B \cap C) = (A \setminus B) \cup (A \setminus C)$; [-@rem:lec10:relative-demorgan].

Таблица принадлежности
:   проверка тождества по $2^k$ вариантам принадлежности; [-@ex:lec10:identity].

$A \mathbin{\triangle} B$ (симметрическая разность)
:   $(A \setminus B) \cup (B \setminus A)$ — элементы ровно одного из множеств; [-@prob:lec10:symdiff].

# Самопроверка

1. Найдите $\bigcup \{\{1, 2\}, \{2, 3\}, \varnothing\}$.
2. Докажите, что не существует множества $S$, содержащего все двухэлементные множества.
3. Докажите, что если $C \subseteq A$ и $C \subseteq B$, то $C \subseteq A \cap B$.
4. Докажите или опровергните: $(A \cup B) \setminus C = A \cup (B \setminus C)$.
5. Найдите $\bigcup\bigcup\{\{\{\varnothing\}\}, \{\varnothing, \{\varnothing\}\}\}$.
6. Пусть $A$ — множество чётных натуральных чисел. Найдите $\bar A$, если универсум $U = \N$; если $U = \Z$.
7. Найдите $\bigcup_{n \in \N} [0, n]$.
8. Докажите или опровергните: $A \cup (B \cap C) = (A \cup B) \cap C$.
9. Опровергните «закон де Моргана» $A \setminus (B \cap C) = (A \setminus B) \cap (A \setminus C)$. Как выглядит верный?
10. Докажите без поэлементных рассуждений: если $A \subseteq B$, то $A \cap C \subseteq B \cap C$.
11. Докажите таблицей принадлежности: $(A \setminus B) \setminus C = (A \setminus C) \setminus (B \setminus C)$.

::: answers
1. $\{1, 2, 3\}$: пустое множество ничего не добавляет.
2. Тогда $\bigcup S$ содержало бы каждое множество $x$: при $x \ne \varnothing$ имеем $x \in \{x, \varnothing\} \in S$, а $\varnothing \in \{\varnothing, \{\varnothing\}\} \in S$ (у обоих множеств по два различных элемента). Это противоречит следствию [-@cor:lec09:no-universal].
3. Пусть $x \in C$; тогда $x \in A$ и $x \in B$, то есть $x \in A \cap B$. Через тождества: $C = C \cap A$, $C = C \cap B$, откуда $C = C \cap (A \cap B)$, и по лемме [-@lem:lec10:subset-equiv] $C \subseteq A \cap B$.
4. Неверно: при $A = C = \{1\}$, $B = \varnothing$ слева $\varnothing$, справа $\{1\}$ (строка $101$ таблицы принадлежности).
5. $\{\varnothing\}$: $\bigcup$ первого уровня даёт $\{\{\varnothing\}\} \cup \{\varnothing, \{\varnothing\}\} = \{\varnothing, \{\varnothing\}\}$, второго — $\varnothing \cup \{\varnothing\} = \{\varnothing\}$.
6. При $U = \N$: $\bar A$ — нечётные натуральные числа. При $U = \Z$: $\bar A = \Z \setminus A$ — все нечётные целые и все отрицательные чётные.
7. $\{x \in \R \mid x \ge 0\}$: каждое $x \ge 0$ лежит в $[0, n]$ при натуральном $n \ge x$, а отрицательные числа не лежат ни в одном отрезке.
8. Неверно: при $A = \{1\}$, $B = C = \varnothing$ слева $\{1\}$, справа $\varnothing$ (строка $100$).
9. При $A = B = \{1\}$, $C = \varnothing$ слева $\{1\} \setminus \varnothing = \{1\}$, справа $\varnothing \cap \{1\} = \varnothing$. Верно $A \setminus (B \cap C) = (A \setminus B) \cup (A \setminus C)$ (замечание [-@rem:lec10:relative-demorgan]).
10. По лемме [-@lem:lec10:subset-equiv] $A \cap B = A$, поэтому $(A \cap C) \cap (B \cap C) = (A \cap B) \cap (C \cap C) = A \cap C$ (коммутативность, ассоциативность, идемпотентность), и по той же лемме $A \cap C \subseteq B \cap C$.
11. Обе части равны $1$ ровно в строке $100$: левая требует $\alpha = 1$, $\beta = 0$, $\gamma = 0$; правая — $\alpha = 1$, $\gamma = 0$ и $x \notin B \setminus C$, а при $\gamma = 0$ это значит $\beta = 0$. Во всех остальных семи строках обе части равны $0$, поэтому тождество верно.
:::
