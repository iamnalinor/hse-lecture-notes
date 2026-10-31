---
course: discrete
lecture: 11
date: 2026-11-20
title: Упорядоченные пары. Декартово произведение
---

# Контекст

Лекция 10 закончилась тождествами алгебры множеств (теорема [-@thm:lec10:identities]) и способами их доказывать. Все построенные до сих пор множества не помнят порядка элементов: $\{a, b\} = \{b, a\}$ (пример [-@ex:lec09:repeat]). А для точки плоскости, решения системы с двумя неизвестными или пары «делитель — делимое» порядок важен: $(1, 2) \ne (2, 1)$, и в лекции 8 решение системы уже было кортежем чисел. Эта лекция строит упорядоченную пару из одних множеств, а из пар — декартово произведение, декартовы степени и кортежи; это строительный материал для следующей лекции, где бинарное отношение будет подмножеством $A \times B$, а затем и функция — отношением особого вида.

# После прочтения ты сможешь

- проверять, равны ли две упорядоченные пары, записывать пару как множество, построенное из её компонент, и восстанавливать компоненты по такому множеству;
- выписывать элементы произведения конечных множеств и узнавать произведения подмножеств прямой и плоскости на рисунке;
- доказывать и опровергать тождества с $\times$, $\cup$, $\cap$, $\setminus$, не забывая о случае пустого множителя;
- переходить от декартовой степени $A^n$ к кортежам, расставлять скобки в кортежах и проверять равенство кортежей по компонентам;
- решать задачи «может ли быть …» про пары, где пара — обычное множество, которое может быть и элементом, и подмножеством.

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

- Если $\{a, b\} = \{c\}$, то $b \in \{c\}$, и $b = c = a$. Тогда левая часть равна $\{\{a\}\}$, и элемент $\{c, d\} = \{a, d\}$ правой части равен $\{a\}$, откуда $d = a = b$ (замечание [-@rem:lec09:pair-collapse]).
- Если $\{a, b\} = \{c, d\} = \{a, d\}$, то $b \in \{a, d\}$, то есть $b = d$ или $b = a$. В первом случае всё доказано. Во втором $\{a, d\} = \{a, b\} = \{a\}$, откуда $d = a = b$ — снова по замечанию [-@rem:lec09:pair-collapse].
:::

::: {.corollary #cor:lec11:pair-swap title="перестановка компонент"}
Для всех $a$, $b$: $(a, b) = (b, a) \iff a = b$.
:::

::: proof
По лемме [-@lem:lec11:pair] $(a, b) = (b, a) \iff a = b \wedge b = a \iff a = b$.
:::

Пример: $(\varnothing, \{\varnothing\}) \ne (\{\varnothing\}, \varnothing)$, так как $\varnothing \ne \{\varnothing\}$.

::: {.example #ex:lec11:components}
Компоненты пары восстанавливаются по ней как по множеству операциями из лекции 10: $\bigcup (a, b) = \{a\} \cup \{a, b\} = \{a, b\}$ и $\bigcap (a, b) = \{a\} \cap \{a, b\} = \{a\}$. Значит, первая компонента — единственный элемент $\bigcap (a, b)$, а вторая — элемент $\bigcup (a, b)$, отличный от первой, или сама первая, если $\bigcup (a, b)$ одноэлементно.

*На примере:* дано $z = \{\{\varnothing\}, \{\varnothing, \{\{\varnothing\}\}\}\}$; является ли $z$ парой и каковы её компоненты? *Ответ:* $z = (\varnothing, \{\{\varnothing\}\})$. *Решение.* $\bigcap z = \{\varnothing\}$, поэтому первая компонента $a = \varnothing$; $\bigcup z = \{\varnothing, \{\{\varnothing\}\}\}$, и отличный от $\varnothing$ элемент — $b = \{\{\varnothing\}\}$. Проверка: $(\varnothing, \{\{\varnothing\}\}) = \{\{\varnothing\}, \{\varnothing, \{\{\varnothing\}\}\}\} = z$.

Это понадобится в лекции 12: по множеству пар $R$ множество всех компонент — это $\bigcup\bigcup R$.
:::

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

::: {.example #ex:lec11:finite-product}
$\{1, 2, 3\} \times \{1, 2\} = \{(1, 1), (1, 2), (2, 1), (2, 2), (3, 1), (3, 2)\}$ — шесть пар; удобно представлять их точками сетки: первая компонента — по горизонтали, вторая — по вертикали (рис. [-@fig:lec11:examples], слева). Каждый из трёх столбцов сетки содержит две точки, поэтому у произведения конечных множеств из $m$ и $n$ элементов ровно $mn$ элементов — отсюда и название «произведение». Строго это докажем в лекции о подсчёте. Произведение $\{1, 2\} \times \{1, 2, 3\}$ — тоже шесть пар, но другое множество: $(1, 3)$ лежит в нём и не лежит в первом, так как $3 \notin \{1, 2\}$ (замечание [-@rem:lec11:product-coord]).
:::

Произведение и не ассоциативно: элементы $A \times (B \times C)$ — пары $(a, (b, c))$, а элементы $(A \times B) \times C$ — пары $((a, b), c)$. Пример: при $A = B = C = \{\varnothing\}$ первое множество — $\{(\varnothing, (\varnothing, \varnothing))\}$, второе — $\{((\varnothing, \varnothing), \varnothing)\}$, а пары $(\varnothing, (\varnothing, \varnothing))$ и $((\varnothing, \varnothing), \varnothing)$ различны по лемме [-@lem:lec11:pair]: их первые компоненты $\varnothing$ и $(\varnothing, \varnothing) = \{\{\varnothing\}\}$ не равны. Совпадают обе расстановки скобок, например, когда один из множителей пуст: тогда обе части равны $\varnothing$. Тем не менее скобки в произведениях опускают, договорившись расставлять их слева направо:
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

::: {.remark #rem:lec11:r3 title="почему скобки слева"}
По соглашению $\R^3 = \R \times \R \times \R = (\R \times \R) \times \R = \R^2 \times \R$: точка пространства $(x, y, z) = ((x, y), z)$ — это точка плоскости $(x, y)$ и высота $z$. Поэтому произведение фигуры на плоскости и множества на прямой — фигура в пространстве. Круг $K = \{(x, y) \in \R^2 \mid x^2 + y^2 \le 1\}$, умноженный на отрезок $[0, 2]$, — сплошной цилиндр высоты $2$ (рис. [-@fig:lec11:examples], справа); окружность, умноженная на тот же отрезок, — его боковая поверхность; квадрат $[0, 1]^2$, умноженный на $[0, 1]$, — куб $[0, 1]^3$. При этом $\R \times \R^2 \ne \R^3$: элементы $\R \times \R^2$ — пары $(x, (y, z))$, «точка на прямой и точка плоскости», и это другая расстановка скобок.
:::

```{.tikz #fig:lec11:examples caption="Слева: $\\{1, 2, 3\\} \\times \\{1, 2\\}$ — шесть точек сетки. Справа: круг $K$ радиуса $1$ с центром в начале координат в плоскости $z = 0$, отрезок $B = [0, 2]$ на оси $z$ и произведение $K \\times B \\subseteq \\R^2 \\times \\R = \\R^3$ — цилиндр с осью $z$; невидимые линии пунктиром"}
\begin{tikzpicture}
  \begin{scope}
    \draw[-{Stealth}] (-0.2,0) -- (3.6,0) node[right] {\small $1$-я};
    \draw[-{Stealth}] (0,-0.2) -- (0,2.6) node[above] {\small $2$-я};
    \foreach \i in {1,2,3} { \draw (\i,0.07) -- (\i,-0.07) node[below] {\small $\i$}; }
    \foreach \j in {1,2} { \draw (0.07,\j) -- (-0.07,\j) node[left] {\small $\j$}; }
    \foreach \i in {1,2,3} { \foreach \j in {1,2} { \fill[nbblue] (\i,\j) circle (2.2pt); } }
    \node[font=\scriptsize, above right] at (3,2) {$(3, 2)$};
    \node[font=\scriptsize, below right] at (1,1) {$(1, 1)$};
  \end{scope}
  \begin{scope}[xshift=7.2cm, yshift=0.9cm]
    \fill[nbblue!22] (-1,0) -- (-1,2) arc (180:360:1 and 0.35) -- (1,0) arc (0:-180:1 and 0.35) -- cycle;
    \fill[nbblue!40] (0,2) ellipse (1 and 0.35);
    \draw[thick, dashed] (1,0) arc (0:180:1 and 0.35);
    \draw[dashed] (0,0) -- (1,0);
    \draw[dashed] (0,0) -- (-0.38,-0.32);
    \draw[very thick, nbred] (0,0) -- (0,2);
    \node[nbred, font=\small] at (0.22,1.05) {$B$};
    \draw[thick] (0,2) ellipse (1 and 0.35);
    \draw[thick] (-1,0) -- (-1,2); \draw[thick] (1,0) -- (1,2);
    \draw[thick] (-1,0) arc (180:360:1 and 0.35);
    \draw[-{Stealth}] (0,2) -- (0,3.2) node[above] {$z$};
    \draw[-{Stealth}] (1,0) -- (2.8,0) node[right] {$y$};
    \draw[-{Stealth}] (-0.38,-0.32) -- (-1.3,-1.1) node[below left] {$x$};
    \draw[nbgray] (0.35,-0.12) -- (1.5,-0.75) node[right, black] {$K$ (дно)};
    \draw[nbgray] (0.75,1.4) -- (1.6,1.8) node[right, black] {$K \times B$};
  \end{scope}
  \end{scope}
\end{tikzpicture}
```

::: {.remark #rem:lec11:power0 tag="корнер-кейс"}
Равенство $A^{n+1} = A^n \times A$ при $n = 0$, вообще говоря, не выполняется: $A^0 \times A$ состоит из пар $(\varnothing, a)$, а не из элементов $A$. При $A = \varnothing$ обе части пусты, но уже для $A = \{\varnothing\}$ получаем $A^0 \times A = \{(\varnothing, \varnothing)\} = \{\{\{\varnothing\}\}\} \ne \{\varnothing\} = A^1$. Поэтому $A^1$ задаётся отдельно. При этом $\varnothing^0 = \{\varnothing\}$ — одноэлементное множество, а $\varnothing^n = \varnothing$ при $n \ge 1$ (пример [-@ex:lec11:product-empty]): как $0^0 = 1$ и $0^n = 0$.
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
Кортеж — модель конечной последовательности: он строится слева направо, вкладыванием в пары, а критерий равенства кортежей не постулируется, а доказывается из определения пары. Так, решение системы сравнений с неизвестными $x_1, \dots, x_k$ из лекции 8 — кортеж $(x_1, \dots, x_k) \in \Z^k$.
:::

# Практика

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

*Ключ:* в отличие от замечания [-@rem:lec11:product-union], «$\cup$» стоит только в одном множителе: на рис. [-@fig:lec11:product] (где роль $C$ задачи играет отрезок $B$, а роль $B$ задачи — отрезок $C$) это квадраты $A \times B$ и $C \times B$: они стоят в одном ряду и вместе дают полосу $(A \cup C) \times B$, «перекрёстных» квадратов нет.
:::

::: {.problem #prob:lec11:loop-pair}
Существуют ли множества $x$ и $y$, для которых $(x, \{x\}) = (\{y\}, y)$?
:::

::: answer
Нет.
:::

::: solution
По лемме [-@lem:lec11:pair] равенство пар означает $x = \{y\}$ и $\{x\} = y$. *Ключ:* подставить одно в другое и получить «петлю» по $\in$. Тогда $x = \{y\} = \{\{x\}\}$, поэтому $\{x\} \in x$, а $x \in \{x\}$. Получаем бесконечную цепочку $x \ni \{x\} \ni x \ni \{x\} \ni \dots$, запрещённую аксиомой [-@ax:lec09:foundation].
:::

::: {.problem #prob:lec11:commute}
Докажите, что $A \times B = B \times A$ тогда и только тогда, когда $A = B$, или $A = \varnothing$, или $B = \varnothing$.
:::

::: answer
Верно.
:::

::: solution
«$\Leftarrow$»: при $A = B$ обе части совпадают по принципу замены; если один из множителей пуст, обе части равны $\varnothing$ (пример [-@ex:lec11:product-empty]).

«$\Rightarrow$»: пусть $A \times B = B \times A$, $A \ne \varnothing$ и $B \ne \varnothing$; докажем $A \subseteq B$. Возьмём $a \in A$. *Ключ:* непустота $B$ нужна, чтобы составить пару: возьмём $b \in B$; тогда $(a, b) \in A \times B = B \times A$, и по замечанию [-@rem:lec11:product-coord] $a \in B$. Включение $B \subseteq A$ — так же, с парой $(b, a)$, $a \in A$. Без условия непустоты вывод неверен: $\{1\} \times \varnothing = \varnothing = \varnothing \times \{1\}$, хотя $\{1\} \ne \varnothing$.
:::

::: {.problem #prob:lec11:minus}
Докажите, что $A \times (B \setminus C) = (A \times B) \setminus (A \times C)$. Найдите $([0, 2] \times [0, 1]) \setminus ([0, 2] \times [\frac12, 3])$ и опишите его как фигуру на плоскости.
:::

::: answer
Тождество верно. Искомое множество — $[0, 2] \times [0, \frac12)$, прямоугольник без верхней стороны.
:::

::: solution
«$\subseteq$»: пусть $z \in A \times (B \setminus C)$, то есть $z = (a, x)$ с $a \in A$, $x \in B$, $x \notin C$. Тогда $z \in A \times B$. Если бы $z \in A \times C$, то по замечанию [-@rem:lec11:product-coord] $x \in C$; значит, $z \notin A \times C$.

«$\supseteq$»: пусть $z \in A \times B$ и $z \notin A \times C$. Тогда $z = (a, x)$ с $a \in A$, $x \in B$. *Ключ:* $x \notin C$, иначе $(a, x) \in A \times C$. Поэтому $x \in B \setminus C$ и $z \in A \times (B \setminus C)$.

По тождеству с $A = [0, 2]$, $B = [0, 1]$, $C = [\frac12, 3]$ получаем $[0, 2] \times ([0, 1] \setminus [\frac12, 3]) = [0, 2] \times [0, \frac12)$: из прямоугольника $[0, 2] \times [0, 1]$ вырезана верхняя половина вместе с отрезком на высоте $\frac12$.
:::

::: {.problem #prob:lec11:union-union}
Докажите, что $\bigcup\bigcup (A \times B) \subseteq A \cup B$ для любых $A$, $B$. Когда включение обращается в равенство?
:::

::: answer
Равенство выполнено тогда и только тогда, когда $A$ и $B$ либо оба пусты, либо оба непусты.
:::

::: solution
*Ключ:* спускаться по уровням вложенности, как в замечании [-@rem:lec10:union-level]. Элементы $A \times B$ — пары $(a, b) = \{\{a\}, \{a, b\}\}$ с $a \in A$, $b \in B$, поэтому элементы $\bigcup (A \times B)$ — множества $\{a\}$ и $\{a, b\}$ для таких $a$, $b$, а элементы $\bigcup\bigcup (A \times B)$ — элементы этих множеств, то есть $a$ или $b$. Значит, каждый элемент $\bigcup\bigcup(A \times B)$ лежит в $A$ или в $B$.

Если $A \ne \varnothing$ и $B \ne \varnothing$, верно и обратное: для $a \in A$ возьмём любое $b \in B$; тогда $a \in \{a\} \in (a, b) \in A \times B$, и $a \in \bigcup\bigcup (A \times B)$; так же для $b \in B$ с любым $a \in A$. Если оба пусты, обе части равны $\varnothing$. Если пусто ровно одно из них, то $A \times B = \varnothing$ и $\bigcup\bigcup \varnothing = \varnothing$, а $A \cup B \ne \varnothing$: например, $\bigcup\bigcup(\{1\} \times \varnothing) = \varnothing \ne \{1\}$.
:::

# Итоги

- Пара $(a, b) = \{\{a\}, \{a, b\}\}$ помнит порядок: $(a, b) = (c, d) \iff a = c \wedge b = d$; компоненты восстанавливаются как элемент $\bigcap (a, b)$ и элементы $\bigcup (a, b)$.
- Пара — обычное множество, поэтому к парам применимы аксиома основания и операции над множествами: уравнения на пары сводятся к равенствам компонент, а «петли» по $\in$ невозможны.
- Декартово произведение не коммутативно и не ассоциативно, $A \times \varnothing = \varnothing$, а сокращать $A \times C \subseteq B \times C$ на $C$ можно только при $C \ne \varnothing$.
- С пересечением и разностью произведение дружит покомпонентно, $(A \times B) \cap (C \times D) = (A \cap C) \times (B \cap D)$, а объединение произведений, вообще говоря, меньше произведения объединений.
- Скобки в $A_1 \times \ldots \times A_n$ и в кортежах ставятся слева: $\R^3 = \R^2 \times \R$, и произведение плоской фигуры на отрезок — тело в пространстве.
- Декартова степень $A^n$ состоит из кортежей длины $n$; два кортежа равны тогда и только тогда, когда равны их соответствующие компоненты; $A^0 = \{\varnothing\}$ даже при $A = \varnothing$.

# Глоссарий

$(a, b)$ (упорядоченная пара по Куратовскому)
:   $\{\{a\}, \{a, b\}\}$; $(a, b) = (c, d) \iff a = c \wedge b = d$; [-@def:lec11:pair].

$A \times B$ (декартово произведение)
:   множество всех пар $(a, b)$ с $a \in A$, $b \in B$; $A_1 \times \ldots \times A_n$ — скобки слева; [-@def:lec11:product].

$A^n$ (декартова степень)
:   $A^0 = \{\varnothing\}$, $A^1 = A$, $A^n = A \times \ldots \times A$ ($n$ раз, скобки слева); [-@def:lec11:power].

$(a_1, \dots, a_n)$ (кортеж, упорядоченный набор)
:   $((\dots(a_1, a_2), \dots), a_n)$; $a_i$ — компоненты (координаты); [-@def:lec11:tuple].

$\R^2$, $\R^3$
:   координатные плоскость и пространство: $\R^2 = \R \times \R$, $\R^3 = \R^2 \times \R$, точка $(x, y, z) = ((x, y), z)$; [-@rem:lec11:r3].

# Самопроверка

1. Равны ли пары $(\varnothing, \{\varnothing\})$ и $(\{\varnothing\}, \varnothing)$? Запишите пару $(\varnothing, \varnothing)$ как множество, построенное из $\varnothing$ и фигурных скобок.
2. Докажите, что $A \times B = \varnothing$ тогда и только тогда, когда $A = \varnothing$ или $B = \varnothing$.
3. Выпишите все элементы множества $\{1, 2\} \times \{1, 2, 3\}$. Равно ли оно $\{1, 2, 3\} \times \{1, 2\}$?
4. Запишите кортеж $(a, b, c)$ через фигурные скобки и $a$, $b$, $c$, раскрыв все пары.
5. Докажите, что из $A \times A = B \times B$ следует $A = B$. Почему здесь, в отличие от примера [-@ex:lec11:cancel], не нужно условие непустоты?
6. Верно ли, что из $A \times B \subseteq C \times D$ всегда следует $A \subseteq C$?
7. Сколько элементов у множества $(\{1, 2, 3\} \times \{1, 2\}) \cap (\{1, 2\} \times \{1, 2, 3\})$?
8. Какая фигура в $\R^3 = \R^2 \times \R$ — множество $L \times \R$, где $L = \{(x, y) \in \R^2 \mid y = x\}$?
9. Почему $A^1$ задаётся отдельно, а не формулой $A^{n+1} = A^n \times A$ при $n = 0$? Чему равны $\varnothing^0$ и $\varnothing^2$?
10. Является ли множество $\{\{\{\varnothing\}\}, \{\{\varnothing\}, \varnothing\}\}$ упорядоченной парой? Если да, найдите её компоненты.
11. Может ли быть $(a, b) \in a$?
12. При каких $x$, $y$ выполнено $(x, 1, y) = (2, y, x)$?

::: answers
1. Нет, по следствию [-@cor:lec11:pair-swap], так как $\varnothing \ne \{\varnothing\}$. $(\varnothing, \varnothing) = \{\{\varnothing\}, \{\varnothing, \varnothing\}\} = \{\{\varnothing\}\}$.
2. «$\Leftarrow$» — пример [-@ex:lec11:product-empty]. «$\Rightarrow$» — контрапозиция: если $a \in A$ и $b \in B$, то $(a, b) \in A \times B$, и произведение непусто.
3. $(1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (2, 3)$. Не равно: $(1, 3)$ лежит в первом произведении, но не во втором, так как $3 \notin \{1, 2\}$.
4. $(a, b, c) = ((a, b), c) = \{\{(a, b)\}, \{(a, b), c\}\} = \{\{\{\{a\}, \{a, b\}\}\}, \{\{\{a\}, \{a, b\}\}, c\}\}$.
5. Пусть $a \in A$. Тогда $(a, a) \in A \times A = B \times B$, и по замечанию [-@rem:lec11:product-coord] $a \in B$; так же $B \subseteq A$. Второй компонентой пары служит сам $a$, так что брать элемент из другого множества не нужно; если $A = \varnothing$, то $B \times B = \varnothing$, и $B = \varnothing$ по задаче 2.
6. Нет: при $B = \varnothing$ имеем $A \times B = \varnothing \subseteq C \times D$ для любых $A$, $C$, например $\{1\} \times \varnothing \subseteq \varnothing \times \varnothing$, но $\{1\} \not\subseteq \varnothing$. При $B \ne \varnothing$ — верно (как в примере [-@ex:lec11:cancel]).
7. $4$: по примеру [-@ex:lec11:product-cap] это $(\{1, 2, 3\} \cap \{1, 2\}) \times (\{1, 2\} \cap \{1, 2, 3\}) = \{1, 2\} \times \{1, 2\}$.
8. Вертикальная плоскость, проходящая через ось $z$ и прямую $y = x$ плоскости $z = 0$: точки $(x, x, z)$ при всех $x, z \in \R$.
9. Формула при $n = 0$ дала бы $A^1 = \{\varnothing\} \times A$ — пары $(\varnothing, a)$, а не элементы $A$ (замечание [-@rem:lec11:power0]). $\varnothing^0 = \{\varnothing\}$, $\varnothing^2 = \varnothing \times \varnothing = \varnothing$.
10. Да: пересечение элементов равно $\{\{\varnothing\}\}$, поэтому первая компонента — $\{\varnothing\}$; объединение равно $\{\{\varnothing\}, \varnothing\}$, вторая компонента — $\varnothing$. Проверка: $(\{\varnothing\}, \varnothing) = \{\{\{\varnothing\}\}, \{\{\varnothing\}, \varnothing\}\}$.
11. Нет: тогда $a \in \{a\} \in (a, b) \in a$, и $a \ni (a, b) \ni \{a\} \ni a \ni \dots$ — бесконечная цепочка, запрещённая аксиомой [-@ax:lec09:foundation].
12. Ни при каких: по лемме [-@lem:lec11:tuple] $x = 2$, $1 = y$ и $y = x$, откуда $1 = 2$.
:::
