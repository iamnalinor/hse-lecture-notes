---
course: algebra
title: "Подготовка к КР-1: Алгебра"
date: 2026-11-07
---

# О контрольной

Восемь вопросов за два часа: определения, доказательство и задачи. Ниже темы в порядке билета.

# Умножение матриц {#sec:kr1:product}

## Что нужно знать

::: {.theorem ref="thm:lec01:assoc"}
$(AB)C = A(BC)$.
:::

## Как решать

1. Проверить размеры: $AB$ определено, когда число столбцов $A$ равно числу строк $B$.
2. Считать поэлементно по формуле [-@eq:lec01:assoc].

::: {.remark #rem:kr1:order tag="подводный камень"}
Порядок множителей менять нельзя, см. @rem:lec01:noncomm.
:::

## Прототипы

::: {.problem #prob:kr1:square}
Найдите $A^2$ для $A = \begin{pmatrix} 1 & 1 \\ 0 & 1 \end{pmatrix}$.
:::

::: answer
$\begin{pmatrix} 1 & 2 \\ 0 & 1 \end{pmatrix}$.
:::

::: solution
Перемножаем строки на столбцы. *Ключ:* правый верхний элемент $1 \cdot 1 + 1 \cdot 1 = 2$.
:::

Ещё задачи: [-@prob:lec01:product]; к теме «@sec:kr1:product» вернёмся в @prob:kr1:square.

::: {.theorem ref="thm:lec01:assoc"}
:::

# Пробный вариант

1. Найдите $B^2$ для $B = \begin{pmatrix} 2 & 0 \\ 0 & 3 \end{pmatrix}$.

::: answers
1. $\begin{pmatrix} 4 & 0 \\ 0 & 9 \end{pmatrix}$.
:::
