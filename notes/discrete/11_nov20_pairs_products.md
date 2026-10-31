---
course: discrete
lecture: 11
date: 2026-11-20
title: Упорядоченные пары. Декартово произведение
---

# Контекст

В лекции 10 появились операции над множествами и тождества алгебры множеств (теорема [-@thm:lec10:identities]). Но множество не помнит порядка элементов: $\{a, b\} = \{b, a\}$. А для точки плоскости, решения системы уравнений или аргументов функции порядок важен: $(1, 2) \ne (2, 1)$. Эта лекция строит упорядоченную пару из одних множеств, а из пар — декартово произведение, декартовы степени и кортежи. Пары и произведения — строительный материал для следующих лекций: бинарное отношение будет подмножеством $A \times B$, функция — отношением особого вида. <!-- TODO enrich -->

# После прочтения ты сможешь

- проверять, равны ли две упорядоченные пары, и записывать пару как множество, построенное из её компонент;
- доказывать свойства декартова произведения, не забывая о случае пустого множества;
- переходить от декартовой степени $A^n$ к кортежам и проверять равенство кортежей по компонентам.

# Теория

## Упорядоченные пары {#sec:lec11:pairs}

Во многих разделах математики нужны упорядоченные «пары», «тройки» и так далее. Точки плоскости отождествляют с координатами, и порядок важен: $(0, 1)$ и $(1, 0)$ — разные точки. Множества же порядка не помнят: $\{2, 3\} = \{3, 2\}$ (пример [-@ex:lec09:repeat]). Тем не менее упорядоченную пару можно смоделировать множеством.

::: {.definition #def:lec11:pair title="упорядоченная пара"}
*Упорядоченной парой* множеств $a$ и $b$ называется множество
$$(a, b) := \{\{a\}, \{a, b\}\}.$$
Это определение пары по Куратовскому.
:::

Идея: $\{a\}$ отмечает, какой элемент первый, а $\{a, b\}$ сообщает, из каких элементов пара состоит. Пример: $(1, 2) = \{\{1\}, \{1, 2\}\}$, $(2, 1) = \{\{2\}, \{1, 2\}\}$ — это разные множества, так как $\{1\} \in (1, 2)$, а $\{1\} \notin (2, 1)$. Вырожденный случай: $(a, a) = \{\{a\}, \{a, a\}\} = \{\{a\}\}$.

От пары требуется одно: равные пары должны иметь равные первые и равные вторые компоненты. Более простая конструкция $\{a, \{b\}\}$ этого не обеспечивает: $\{\{1\}, \{2\}\}$ получается и при $a = \{1\}$, $b = 2$, и при $a = \{2\}$, $b = 1$, хотя $\{1\} \ne \{2\}$. Пара по Куратовскому этим свойством обладает.

::: {.lemma #lem:lec11:pair title="критерий равенства пар"}
Для всех $a$, $b$, $c$, $d$: $(a, b) = (c, d) \iff a = c \wedge b = d$.
:::

::: proof
*Идея:* сравнить элементы обеих частей, следя за вырожденным случаем, когда «двухэлементное» множество одноэлементно.

«$\Leftarrow$»: равные множества взаимозаменяемы, поэтому из $(a, b) = (a, b)$, $a = c$, $b = d$ получаем $(a, b) = (c, d)$.

«$\Rightarrow$». Пусть $\{\{a\}, \{a, b\}\} = \{\{c\}, \{c, d\}\}$.

*Шаг 1: $a = c$.* Так как $\{a\}$ — элемент левой части, $\{a\} = \{c\}$ или $\{a\} = \{c, d\}$. В обоих случаях $c \in \{a\}$, то есть $c = a$.

*Шаг 2: $b = d$.* Так как $\{a, b\}$ — элемент левой части, $\{a, b\} = \{c\}$ или $\{a, b\} = \{c, d\}$.

- Если $\{a, b\} = \{c\}$, то $b \in \{c\}$, и $b = c = a$. Тогда левая часть равна $\{\{a\}\}$, и элемент $\{c, d\}$ правой части равен $\{a\}$, откуда $d = a = b$.
- Если $\{a, b\} = \{c, d\} = \{a, d\}$, то $b \in \{a, d\}$, то есть $b = d$ или $b = a$. В первом случае всё доказано. Во втором $\{a, d\} = \{a, b\} = \{a\}$, откуда $d = a = b$.
:::

::: {.corollary #cor:lec11:pair-swap title="перестановка компонент"}
Для всех $a$, $b$: $(a, b) = (b, a) \iff a = b$.
:::

::: proof
По лемме [-@lem:lec11:pair] $(a, b) = (b, a) \iff a = b \wedge b = a \iff a = b$.
:::

Пример: $(\varnothing, \{\varnothing\}) \ne (\{\varnothing\}, \varnothing)$, так как $\varnothing \ne \{\varnothing\}$.

::: {.remark #rem:lec11:pair-pp}
Если $a, b \in X$, то $(a, b) \in \mathcal{P}(\mathcal{P}(X))$. Действительно, $\{a\}$ и $\{a, b\}$ — подмножества $X$, то есть элементы $\mathcal{P}(X)$, поэтому $(a, b) = \{\{a\}, \{a, b\}\} \subseteq \mathcal{P}(X)$. Это понадобится, чтобы получить множество всех пар аксиомой выделения.
:::

## Декартово произведение {#sec:lec11:product}

::: {.definition #def:lec11:product title="декартово произведение"}
*Декартовым произведением* множеств $A$ и $B$ называется множество
$$A \times B := \{z \in \mathcal{P}(\mathcal{P}(A \cup B)) \mid \exists a \in A\ \exists b \in B\ z = (a, b)\}.$$
:::

Множество существует по аксиоме выделения; объемлющее множество $\mathcal{P}(\mathcal{P}(A \cup B))$ требуется аксиомой, но в остальном о нём можно забыть: для каждого $z$
$$z \in A \times B \iff \exists a \in A\ \exists b \in B\ z = (a, b).$$
В самом деле, если $z = (a, b)$ с $a \in A$, $b \in B$, то $a, b \in A \cup B$, и по замечанию [-@rem:lec11:pair-pp] $z \in \mathcal{P}(\mathcal{P}(A \cup B))$. Отсюда менее точная, но удобная запись $A \times B = \{(a, b) \mid a \in A,\ b \in B\}$. Если $A$ и $B$ — подмножества прямой, $A \times B$ изображается частью плоскости (рис. [-@fig:lec11:product]).

::: {.remark #rem:lec11:product-coord}
Если $(x, y) \in A \times B$, то $x \in A$ и $y \in B$ (и обратно). Действительно, по определению $(x, y) = (a, b)$ для некоторых $a \in A$, $b \in B$, и по лемме [-@lem:lec11:pair] $x = a$, $y = b$.

Это следствие критерия равенства пар, а не мелочь: «сумма» $A + B := \{a + b \mid a \in A,\ b \in B\}$ числовых множеств этим свойством не обладает — $2 + 3 = 4 + 1 \in \{1, 4, 0\} + \{5, 1\}$, хотя $2 \notin \{1, 4, 0\}$ и $3 \notin \{5, 1\}$.
:::

::: {.example #ex:lec11:product-empty}
$A \times \varnothing = \varnothing$ для любого $A$: если $z \in A \times \varnothing$, то $z = (a, b)$ и $b \in \varnothing$ для некоторых $a$, $b$, что невозможно. Так же $\varnothing \times A = \varnothing$.
:::

::: {.example #ex:lec11:product-noncomm}
$A \times B$ не обязано равняться $B \times A$. Для $A = \{\varnothing\}$, $B = \{\{\varnothing\}\}$ имеем $A \times B = \{(\varnothing, \{\varnothing\})\}$ и $B \times A = \{(\{\varnothing\}, \varnothing)\}$, а $(\varnothing, \{\varnothing\}) \ne (\{\varnothing\}, \varnothing)$ по следствию [-@cor:lec11:pair-swap], так как $\varnothing \ne \{\varnothing\}$.
:::

Произведение и не ассоциативно: элементы $A \times (B \times C)$ — пары $(a, (b, c))$, а элементы $(A \times B) \times C$ — пары $((a, b), c)$, и, вообще говоря, это разные множества (совпадают они, например, когда один из множителей пуст: тогда обе части равны $\varnothing$). Тем не менее скобки в произведениях опускают, договорившись расставлять их слева направо:
$$A_1 \times A_2 \times A_3 \times \ldots \times A_n := (\dots((A_1 \times A_2) \times A_3) \times \ldots) \times A_n.$$

::: {.example #ex:lec11:product-cap}
Для любых $A$, $B$, $C$, $D$: $(A \times B) \cap (C \times D) = (A \cap C) \times (B \cap D)$.

*Решение.* «$\subseteq$»: пусть $z \in (A \times B) \cap (C \times D)$. Из $z \in A \times B$ получаем $z = (a, b)$ с $a \in A$, $b \in B$. Из $(a, b) \in C \times D$ по замечанию [-@rem:lec11:product-coord] $a \in C$, $b \in D$. Итак, $a \in A \cap C$, $b \in B \cap D$, и $z = (a, b) \in (A \cap C) \times (B \cap D)$. «$\supseteq$»: если $z = (x, y)$ с $x \in A \cap C$, $y \in B \cap D$, то $x \in A$, $y \in B$ дают $z \in A \times B$, а $x \in C$, $y \in D$ — $z \in C \times D$.

На рис. [-@fig:lec11:product] отрезки $A$ и $C$ не пересекаются, поэтому $A \cap C = \varnothing$ и $(A \times B) \cap (C \times D) = \varnothing$ — «прямоугольник» с пустой стороной. Если бы отрезки $A$ и $C$ (и $B$ и $D$) перекрывались, пересечение прямоугольников было бы прямоугольником $(A \cap C) \times (B \cap D)$.
:::

```{.tikz #fig:lec11:product caption="Произведения отрезков на плоскости: $A \times B$ и $C \times D$ закрашены; $(A \cup C) \times (B \cup D)$ содержит ещё два пунктирных квадрата, поэтому оно больше $(A \times B) \cup (C \times D)$"}
\begin{tikzpicture}[x=0.85cm, y=0.8cm]
  \draw[-{Stealth}] (-0.3,0) -- (5.2,0) node[right] {$x$};
  \draw[-{Stealth}] (0,-0.3) -- (0,4.2) node[above] {$y$};
  \fill[nbblue!35] (1,1) rectangle (2,2);
  \fill[nbred!30] (3,3) rectangle (4,4);
  \draw[thick] (1,1) rectangle (2,2); \draw[thick] (3,3) rectangle (4,4);
  \draw[dashed] (3,1) rectangle (4,2); \draw[dashed] (1,3) rectangle (2,4);
  \node[font=\scriptsize] at (1.5,1.5) {$A \times B$};
  \node[font=\scriptsize] at (3.5,3.5) {$C \times D$};
  \node[nbgray, font=\scriptsize] at (3.5,1.5) {$C \times B$};
  \node[nbgray, font=\scriptsize] at (1.5,3.5) {$A \times D$};
  \draw[very thick, nbblue] (1,0) -- (2,0) node[midway, below] {$A$};
  \draw[very thick, nbred] (3,0) -- (4,0) node[midway, below] {$C$};
  \draw[very thick, nbblue] (0,1) -- (0,2) node[midway, left] {$B$};
  \draw[very thick, nbred] (0,3) -- (0,4) node[midway, left] {$D$};
  \draw[aux] (1,0) -- (1,1); \draw[aux] (2,0) -- (2,1); \draw[aux] (3,0) -- (3,1); \draw[aux] (4,0) -- (4,1);
  \draw[aux] (0,1) -- (1,1); \draw[aux] (0,2) -- (1,2); \draw[aux] (0,3) -- (1,3); \draw[aux] (0,4) -- (1,4);
\end{tikzpicture}
```

::: {.remark #rem:lec11:product-union tag="частое заблуждение"}
«*Раз $(A \times B) \cap (C \times D) = (A \cap C) \times (B \cap D)$, то и $(A \times B) \cup (C \times D) = (A \cup C) \times (B \cup D)$.*» Нет. На рис. [-@fig:lec11:product] при $A = B = [1, 2]$, $C = D = [3, 4]$ правая часть — четыре квадрата, а левая — только два закрашенных: точка $(1, 3)$ лежит в $(A \cup C) \times (B \cup D)$, но не в объединении. Конечный пример: $A = B = \{1\}$, $C = D = \{2\}$ — пара $(1, 2)$ справа есть, слева нет. Верно только включение «$\subseteq$». А вот дистрибутивность по одному множителю верна: $(A \cup B) \times C = (A \times C) \cup (B \times C)$ (задача [-@prob:lec11:product-union]).
:::

::: {.example #ex:lec11:cancel}
Пусть $C \ne \varnothing$. Тогда $A \times C \subseteq B \times C \iff A \subseteq B$.

*Решение.* «$\Rightarrow$»: пусть $A \times C \subseteq B \times C$ и $a \in A$. *Здесь нужна непустота:* так как $C \ne \varnothing$, есть $c_0 \in C$. Тогда $(a, c_0) \in A \times C \subseteq B \times C$, и по замечанию [-@rem:lec11:product-coord] $a \in B$. «$\Leftarrow$»: если $A \subseteq B$, то по лемме [-@lem:lec10:subset-equiv] $A = A \cap B$, и по примеру [-@ex:lec11:product-cap]
$$A \times C = (A \cap B) \times (C \cap C) = (A \times C) \cap (B \times C) \subseteq B \times C.$$
:::

::: {.remark #rem:lec11:cancel-empty tag="корнер-кейс"}
Без условия $C \ne \varnothing$ первая импликация неверна: $\R \times \varnothing = \varnothing = \N \times \varnothing$ (пример [-@ex:lec11:product-empty]), но $\R \not\subseteq \N$. На пустое множество, как и на ноль в равенстве $a \cdot 0 = b \cdot 0$, «сокращать» нельзя.
:::

## Декартова степень и кортежи {#sec:lec11:power}

Как для чисел, можно определить степени относительно декартова произведения.

::: {.definition #def:lec11:power title="декартова степень"}
Для множества $A$ положим $A^0 := \{\varnothing\}$, $A^1 := A$ и $A^n := \underbrace{A \times A \times \ldots \times A}_{n}$ при натуральном $n \ge 2$ (скобки — слева направо).
:::

Тогда $A^{n+1} = A^n \times A$ для всех $n \ge 1$, а в $A^0$ ровно один элемент — как $x^{n+1} = x^n \cdot x$ и $x^0 = 1$ для чисел. Например, $\R^2 = \R \times \R$ — координатная плоскость, $\R^3 = (\R \times \R) \times \R$.

::: {.remark #rem:lec11:power0 tag="корнер-кейс"}
Равенство $A^{n+1} = A^n \times A$ при $n = 0$, вообще говоря, не выполняется (при $A \ne \varnothing$): $A^0 \times A$ состоит из пар $(\varnothing, a)$, а не из элементов $A$. Например, для $A = \{\varnothing\}$ получаем $A^0 \times A = \{(\varnothing, \varnothing)\} = \{\{\{\varnothing\}\}\} \ne \{\varnothing\} = A^1$. Поэтому $A^1$ задаётся отдельно. При этом $\varnothing^0 = \{\varnothing\}$ — одноэлементное множество, а $\varnothing^n = \varnothing$ при $n \ge 1$ (пример [-@ex:lec11:product-empty]): как $0^0 = 1$ и $0^n = 0$.
:::

::: {.definition #def:lec11:tuple title="кортеж"}
При $n \ge 2$ *кортежем* (упорядоченным набором, $n$-tuple) длины $n$ из множеств $a_1, \dots, a_n$ называется
$$(a_1, \dots, a_{n-1}, a_n) := ((\dots((a_1, a_2), a_3), \dots, a_{n-1}), a_n).$$
Множества $a_i$ называются *компонентами* (координатами) кортежа.
:::

Например, $(a, b, c) = ((a, b), c)$.

::: {.lemma #lem:lec11:tuple title="критерий равенства кортежей"}
Для любого $n \ge 2$: $(a_1, \dots, a_n) = (b_1, \dots, b_n) \iff a_i = b_i$ при всех $i \in \{1, \dots, n\}$.
:::

::: proof
Применим лемму [-@lem:lec11:pair] $n - 1$ раз. Из $((a_1, \dots, a_{n-1}), a_n) = ((b_1, \dots, b_{n-1}), b_n)$ получаем $a_n = b_n$ и $(a_1, \dots, a_{n-1}) = (b_1, \dots, b_{n-1})$; так «снимаем» по одной компоненте, пока не останется $(a_1, a_2) = (b_1, b_2)$, то есть $a_1 = b_1$, $a_2 = b_2$. Обратная импликация — принцип замены.
:::

Отсюда, как в замечании [-@rem:lec11:product-coord], для каждого $x$
$$x \in A_1 \times \ldots \times A_n \iff \exists a_1 \in A_1 \dots \exists a_n \in A_n\ x = (a_1, \dots, a_n),$$
и в частности $x \in A^n \iff \exists a_1 \in A \dots \exists a_n \in A\ x = (a_1, \dots, a_n)$.

::: {.remark #rem:lec11:tuples-strings title="кортежи и последовательности"}
Кортеж — модель конечной последовательности: он строится слева направо, вкладыванием в пары, а критерий равенства кортежей не постулируется, а доказывается из определения пары. Дальше пары и произведения — основной строительный материал: бинарное отношение будет подмножеством $A \times B$, функция — отношением особого вида.

:::

# Практика

<!-- TODO enrich -->

::: {.problem #prob:lec11:pair-trick}
Может ли быть так, что $R \subseteq A \times B$ и одновременно $R \in A \times B$?
:::

::: answer
Да. Например, $A = B = \{\varnothing, \{\varnothing\}\}$ и $R = (\{\varnothing\}, \{\varnothing\}) = \{\{\{\varnothing\}\}\}$.
:::

::: solution
*Ключ:* разобрать, как устроено $R$. Из $R \in A \times B$ следует $R = (a, b) = \{\{a\}, \{a, b\}\}$ с $a \in A$, $b \in B$. Чтобы было $R \subseteq A \times B$, элементы $\{a\}$ и $\{a, b\}$ должны быть парами. Одноэлементная пара — это $(c, c) = \{\{c\}\}$ (вырожденный случай после определения [-@def:lec11:pair]), поэтому $a = \{c\}$. Проще всего взять $b = a$ и $c = \varnothing$: тогда $a = b = \{\varnothing\}$ и $R = (a, a) = \{\{a\}\} = \{\{\{\varnothing\}\}\}$.

Проверка для $A = B = \{\varnothing, \{\varnothing\}\}$. $R \in A \times B$, так как $R = (\{\varnothing\}, \{\varnothing\})$ и $\{\varnothing\} \in A$, $\{\varnothing\} \in B$. $R \subseteq A \times B$, так как единственный элемент $R$ — множество $\{\{\varnothing\}\} = (\varnothing, \varnothing)$, а $\varnothing \in A$, $\varnothing \in B$. Пример показывает, что «пара» — не особый тип объекта, а обычное множество, которое может одновременно быть и элементом, и подмножеством произведения.
:::

::: {.problem #prob:lec11:product-union}
Докажите, что $(A \cup B) \times C = (A \times C) \cup (B \times C)$.
:::

::: answer
Верно; два включения через произвольный элемент, в каждом — разбор случаев $x \in A$ / $x \in B$.
:::

::: solution
«$\subseteq$»: пусть $z \in (A \cup B) \times C$, то есть $z = (x, c)$ с $x \in A \cup B$, $c \in C$. Если $x \in A$, то $z \in A \times C$; если $x \in B$, то $z \in B \times C$. В обоих случаях $z$ лежит в правой части.

«$\supseteq$»: пусть $z \in A \times C$ (случай $z \in B \times C$ симметричен). Тогда $z = (x, c)$ с $x \in A \subseteq A \cup B$ и $c \in C$, значит, $z \in (A \cup B) \times C$.

*Ключ:* в отличие от замечания [-@rem:lec11:product-union], «$\cup$» стоит только в одном множителе: на рис. [-@fig:lec11:product] (где роль $C$ задачи играет отрезок $B$, а роль $B$ задачи — отрезок $C$) это квадраты $A \times B$ и $C \times B$ — одна горизонтальная полоса $(A \cup C) \times B$, без «перекрёстных» квадратов.
:::

# Итоги

- Пара $(a, b) = \{\{a\}, \{a, b\}\}$ помнит порядок: $(a, b) = (c, d) \iff a = c \wedge b = d$.
- Декартово произведение не коммутативно и не ассоциативно, $A \times \varnothing = \varnothing$, а сокращать $A \times C \subseteq B \times C$ на $C$ можно только при $C \ne \varnothing$.
- Декартова степень $A^n$ состоит из кортежей длины $n$; два кортежа равны тогда и только тогда, когда равны их соответствующие компоненты.

# Глоссарий

$(a, b)$ (упорядоченная пара по Куратовскому)
:   $\{\{a\}, \{a, b\}\}$; $(a, b) = (c, d) \iff a = c \wedge b = d$; [-@def:lec11:pair].

$A \times B$ (декартово произведение)
:   множество всех пар $(a, b)$ с $a \in A$, $b \in B$; [-@def:lec11:product].

$A^n$ (декартова степень)
:   $A^0 = \{\varnothing\}$, $A^1 = A$, $A^n = A \times \ldots \times A$ ($n$ раз, скобки слева); [-@def:lec11:power].

$(a_1, \dots, a_n)$ (кортеж)
:   $((\dots(a_1, a_2), \dots), a_n)$; $a_i$ — компоненты (координаты); [-@def:lec11:tuple].

# Самопроверка

<!-- TODO enrich -->

1. Равны ли пары $(\varnothing, \{\varnothing\})$ и $(\{\varnothing\}, \varnothing)$? Запишите пару $(\varnothing, \varnothing)$ как множество, построенное из $\varnothing$ и фигурных скобок.
2. Докажите, что $A \times B = \varnothing$ тогда и только тогда, когда $A = \varnothing$ или $B = \varnothing$.
3. Выпишите все элементы множества $\{1, 2\} \times \{1, 2, 3\}$. Равно ли оно $\{1, 2, 3\} \times \{1, 2\}$?

::: answers
1. Нет, по следствию [-@cor:lec11:pair-swap], так как $\varnothing \ne \{\varnothing\}$. $(\varnothing, \varnothing) = \{\{\varnothing\}, \{\varnothing, \varnothing\}\} = \{\{\varnothing\}\}$.
2. «$\Leftarrow$» — пример [-@ex:lec11:product-empty]. «$\Rightarrow$» — контрапозиция: если $a \in A$ и $b \in B$, то $(a, b) \in A \times B$, и произведение непусто.
3. $(1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (2, 3)$. Не равно: $(1, 3)$ лежит в первом произведении, но не во втором, так как $3 \notin \{1, 2\}$.
:::
