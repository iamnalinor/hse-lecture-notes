---
course: calculus
lecture: 17
date: 2027-01-22
title: Внесение под знак дифференциала. Замена переменной. Интегрирование по частям
---

# Контекст

В лекции 16 появились первообразная и неопределённый интеграл (определения [-@def:lec16:antiderivative], [-@def:lec16:indefinite]), таблица основных интегралов, линейность и линейная замена $\int f(kx + b)\,dx = \frac1k F(kx + b) + C$ (утверждение [-@prop:lec16:linearity]). Этого хватает для сумм табличных функций, но не для произведений и сложных функций: $\int x e^x\,dx$ и $\int x e^{x^2}\,dx$ «по таблице» не берутся, а наивные правила дают неверный ответ (замечание [-@rem:lec16:no-product-rule]).

Сегодня два основных метода. Правило дифференцирования сложной функции, прочитанное справа налево, даёт замену переменной; правило дифференцирования произведения — интегрирование по частям. С ними таблица расширяется, и берутся интегралы от дробей вида $\frac{Ax + B}{x^2 + px + q}$.

# После прочтения ты сможешь

- находить интегралы вида $\int f(\varphi(x))\varphi'(x)\,dx$ внесением множителя под знак дифференциала;
- делать замену переменной $x = \varphi(t)$: пересчитывать $dx$, выбирать промежуток для $t$ и возвращаться к $x$;
- интегрировать по частям, выбирая $u$ и $dv$, в том числе когда интеграл возвращается к исходному;
- находить интегралы от дробей $\frac{Ax + B}{x^2 + px + q}$ и от $\frac{1}{\sqrt{x^2 + px + q}}$ выделением полного квадрата;
- находить все первообразные кусочно заданной функции на прямой.

# Теория

## Внесение под знак дифференциала {#sec:lec17:differential}

Рассмотрим $\int 2x\cos(x^2)\,dx$. Множитель $2x$ — производная внутренней функции $x^2$, поэтому подынтегральная функция — производная сложной функции: $(\sin(x^2))' = \cos(x^2) \cdot 2x$. Значит, $\int 2x\cos(x^2)\,dx = \sin(x^2) + C$. Здесь работает правило дифференцирования сложной функции (теорема [-@thm:lec12:chain]), прочитанное справа налево.

::: {.theorem #thm:lec17:substitution title="интегрирование подстановкой"}
Пусть $F$ — первообразная $f$ на интервале $J$, функция $\varphi$ дифференцируема на интервале $I$ и $\varphi(x) \in J$ при всех $x \in I$. Тогда на $I$
$$\int f(\varphi(x))\,\varphi'(x)\,dx = F(\varphi(x)) + C.$$ {#eq:lec17:substitution}
:::

::: proof
По теореме [-@thm:lec12:chain] $\big(F(\varphi(x))\big)' = F'(\varphi(x))\,\varphi'(x) = f(\varphi(x))\,\varphi'(x)$ при всех $x \in I$. Значит, $F \circ \varphi$ — первообразная подынтегральной функции, и остаётся теорема [-@thm:lec16:general-form].
:::

Запись с дифференциалом делает это правило механическим. Так как $\varphi'(x)\,dx = d\varphi(x)$ (определение [-@def:lec12:differential]), формула [-@eq:lec17:substitution] читается как
$$\int f(\varphi(x))\,d\varphi(x) = F(\varphi(x)) + C:$$
в любой строке таблицы вместо $x$ можно подставить дифференцируемую функцию $\varphi(x)$ — и под знаком функции, и под знаком дифференциала. Превратить множитель $\varphi'(x)$ в $d\varphi(x)$ — значит *внести его под знак дифференциала*. Линейная замена из лекции 16 — частный случай: $dx = \frac1k\,d(kx + b)$.

Чаще всего вносят:

| Множитель | Под дифференциалом | | Множитель | Под дифференциалом |
| --- | --- | --- | --- | --- |
| $x^n\,dx$ | $\frac{1}{n + 1}\,d(x^{n+1})$ | | $\cos x\,dx$ | $d(\sin x)$ |
| $\frac{dx}{x}$ | $d(\ln \lvert x \rvert)$ | | $\sin x\,dx$ | $-d(\cos x)$ |
| $\frac{dx}{2\sqrt x}$ | $d(\sqrt x)$ | | $\frac{dx}{\cos^2 x}$ | $d(\operatorname{tg} x)$ |
| $e^x\,dx$ | $d(e^x)$ | | $\frac{dx}{1 + x^2}$ | $d(\operatorname{arctg} x)$ |

Пример: $\int x e^{x^2}\,dx = \frac12\int e^{x^2}\,d(x^2) = \frac12 e^{x^2} + C$. Проверка: $\left(\frac12 e^{x^2}\right)' = \frac12 e^{x^2} \cdot 2x = x e^{x^2}$.

::: {.remark #rem:lec17:factor tag="подводный камень"}
Под дифференциал вносится *ровно* производная: $x\,dx = \frac12\,d(x^2)$, а не $d(x^2)$. Забытый множитель даёт ответ, который отличается от верного не на постоянную, а в несколько раз: «$\int x e^{x^2}\,dx = e^{x^2} + C$» — производная $2x e^{x^2}$, вдвое больше. Внести под дифференциал можно только то, что действительно стоит множителем: в $\int e^{x^2}\,dx$ множителя $x$ нет, и «$\frac{e^{x^2}}{2x}$» — не ответ (замечание [-@rem:lec16:no-product-rule]).
:::

Самый частый частный случай — когда в числителе стоит производная знаменателя.

::: {.corollary #cor:lec17:log title="логарифмическая производная"}
Если $\varphi$ дифференцируема на интервале $I$ и $\varphi(x) \ne 0$ на $I$, то
$$\int \frac{\varphi'(x)}{\varphi(x)}\,dx = \ln|\varphi(x)| + C.$$
:::

::: proof
Теорема [-@thm:lec17:substitution] с $f(t) = \frac1t$, $F(t) = \ln|t|$; так как $\varphi$ непрерывна и не обращается в ноль на интервале, она сохраняет знак (следствие [-@cor:lec10:intermediate]), и все её значения лежат на одном луче $J$, где $\ln|t|$ — первообразная $\frac1t$.
:::

Примеры: $\int \operatorname{tg} x\,dx = -\int \frac{(\cos x)'}{\cos x}\,dx = -\ln|\cos x| + C$ (на каждом интервале, где $\cos x \ne 0$); $\int \frac{x}{x^2 + 1}\,dx = \frac12\ln(x^2 + 1) + C$; $\int \frac{dx}{x\ln x} = \int \frac{d(\ln x)}{\ln x} = \ln|\ln x| + C$ при $x > 0$, $x \ne 1$.

::: {.example #ex:lec17:differential}
Найдём $\int x^2\sqrt{x^3 + 1}\,dx$, $\int \sin^3 x\,dx$ и $\int \frac{e^{\sqrt x}}{\sqrt x}\,dx$.

*Ответ:* $\frac29(x^3 + 1)^{3/2} + C$; $-\cos x + \frac{\cos^3 x}{3} + C$; $2e^{\sqrt x} + C$.

*Решение.* Первый: $x^2\,dx = \frac13\,d(x^3 + 1)$, и $\frac13\int (x^3 + 1)^{1/2}\,d(x^3 + 1) = \frac13 \cdot \frac23 (x^3 + 1)^{3/2}$. Второй: *ключ:* при нечётной степени синуса отделить один множитель $\sin x$ и внести его под дифференциал, а остальное выразить через $\cos x$: $\sin^3 x\,dx = -(1 - \cos^2 x)\,d(\cos x)$, и $-\int (1 - t^2)\,dt$ при $t = \cos x$ даёт $-\cos x + \frac{\cos^3 x}{3}$. Третий: $\frac{dx}{\sqrt x} = 2\,d(\sqrt x)$, $2\int e^{\sqrt x}\,d(\sqrt x) = 2e^{\sqrt x}$.
:::

## Замена переменной {#sec:lec17:change}

В $\int \frac{dx}{1 + \sqrt x}$ множителя вида $\varphi'(x)$ не видно. Но если обозначить $\sqrt x = t$, то $x = t^2$, $dx = 2t\,dt$, и интеграл превращается в $\int \frac{2t\,dt}{1 + t}$ — дробь, которая берётся. Здесь формула [-@eq:lec17:substitution] применяется в обратную сторону: старая переменная выражается через новую, $x = \varphi(t)$. Чтобы вернуться от $t$ к $x$, функция $\varphi$ должна быть обратима.

::: {.theorem #thm:lec17:change title="замена переменной"}
Пусть функция $\varphi$ непрерывна и строго монотонна на интервале $J$, дифференцируема на нём, $\varphi'(t) \ne 0$ при всех $t \in J$, и $I = \varphi(J)$. Если $G$ — первообразная функции $f(\varphi(t))\,\varphi'(t)$ на $J$, то на $I$
$$\int f(x)\,dx = G\big(\varphi^{-1}(x)\big) + C.$$ {#eq:lec17:change}
:::

::: proof
*Идея:* продифференцировать $G(\varphi^{-1}(x))$ по правилу сложной функции, а производную $\varphi^{-1}$ взять по теореме об обратной функции.

По следствию [-@cor:lec11:inverse-interval] $I$ — промежуток, а $\varphi^{-1}\colon I \to J$ непрерывна и строго монотонна. Строго монотонная непрерывная функция на интервале не принимает наибольшего и наименьшего значений, поэтому $I$ — интервал, и каждая его точка $x = \varphi(t)$ — образ внутренней точки $t \in J$. По теореме [-@thm:lec12:inverse] $\varphi^{-1}$ дифференцируема в $x$ и $(\varphi^{-1})'(x) = \frac{1}{\varphi'(t)}$. По теореме [-@thm:lec12:chain]
$$\big(G(\varphi^{-1}(x))\big)' = G'(t) \cdot \frac{1}{\varphi'(t)} = \frac{f(\varphi(t))\,\varphi'(t)}{\varphi'(t)} = f(\varphi(t)) = f(x).$$
:::

На практике: (1) положить $x = \varphi(t)$ и найти $dx = \varphi'(t)\,dt$; (2) взять интеграл по $t$; (3) подставить $t = \varphi^{-1}(x)$. Для $\int \frac{dx}{1 + \sqrt x}$ при $x > 0$: $x = t^2$, $t \in (0;\ +\infty)$, $\varphi'(t) = 2t \ne 0$, и
$$\int \frac{2t\,dt}{1 + t} = \int \left(2 - \frac{2}{1 + t}\right)dt = 2t - 2\ln(1 + t) + C = 2\sqrt x - 2\ln(1 + \sqrt x) + C.$$
Проверка: $\left(2\sqrt x - 2\ln(1 + \sqrt x)\right)' = \frac{1}{\sqrt x} - \frac{1}{(1 + \sqrt x)\sqrt x} = \frac{1}{\sqrt x} \cdot \frac{\sqrt x}{1 + \sqrt x} = \frac{1}{1 + \sqrt x}$.

::: {.example #ex:lec17:circle}
Найдём $\int \sqrt{1 - x^2}\,dx$ на $(-1;\ 1)$.

*Ответ:* $\frac12\left(\arcsin x + x\sqrt{1 - x^2}\right) + C$.

*Решение.* *Ключ:* замена $x = \sin t$ превращает $1 - x^2$ в полный квадрат $\cos^2 t$. Берём $t \in \left(-\frac\pi2;\ \frac\pi2\right)$: там синус строго возрастает, $(\sin t)' = \cos t > 0$, и $\sqrt{1 - \sin^2 t} = \cos t$ (а не $|\cos t|$ — на этом интервале косинус положителен). Тогда $dx = \cos t\,dt$ и
$$\int \cos t \cdot \cos t\,dt = \int \frac{1 + \cos 2t}{2}\,dt = \frac t2 + \frac{\sin 2t}{4} + C = \frac t2 + \frac{\sin t\cos t}{2} + C.$$
Возвращаемся: $t = \arcsin x$, $\sin t = x$, $\cos t = \sqrt{1 - x^2}$. Проверка: $\left(\frac12\arcsin x\right)' = \frac{1}{2\sqrt{1 - x^2}}$, $\left(\frac12 x\sqrt{1 - x^2}\right)' = \frac{1 - 2x^2}{2\sqrt{1 - x^2}}$, сумма $\frac{2 - 2x^2}{2\sqrt{1 - x^2}} = \sqrt{1 - x^2}$.
:::

Этот интеграл понадобится, когда появится определённый интеграл: график $\sqrt{1 - x^2}$ — верхняя полуокружность, и через найденную первообразную будет вычислена площадь круга.

::: {.remark #rem:lec17:monotone tag="корнер-кейс"}
Промежуток для $t$ выбирают так, чтобы $\varphi$ на нём была строго монотонна (рис. [-@fig:lec17:sin-branches]), — иначе не определена обратная замена $t = \varphi^{-1}(x)$, и неясно, как вернуться к $x$. Для $x = \sin t$ на всём $\R$ значению $x$ отвечает бесконечно много $t$. От выбора промежутка зависит и знак корня: на $\left(\frac\pi2;\ \frac{3\pi}{2}\right)$ синус тоже монотонен, но там $\sqrt{1 - \sin^2 t} = -\cos t$, и пропущенный модуль дал бы ответ с неверным знаком.
:::

```{.tikz #fig:lec17:sin-branches caption="Замена $x = \\sin t$. На $\\left(-\\frac\\pi2;\\ \\frac\\pi2\\right)$ (синий участок) синус возрастает, каждому $x \\in (-1;\\ 1)$ отвечает ровно одно $t = \\arcsin x$, и $\\cos t > 0$. На $\\left(\\frac\\pi2;\\ \\frac{3\\pi}{2}\\right)$ (оранжевый участок) синус убывает, а $\\cos t < 0$, поэтому там $\\sqrt{1 - \\sin^2 t} = -\\cos t$. Значению $x = 0{,}5$ на всей прямой отвечает бесконечно много $t$"}
\begin{tikzpicture}
\begin{axis}[nbaxis, clip=false, xmin=-2.2, xmax=5.6, ymin=-1.4, ymax=1.5, width=11cm, height=5cm,
  xlabel={$t$}, ylabel={$x$}, xtick={-1.5708,1.5708,4.7124}, xticklabels={$-\frac\pi2$, $\frac\pi2$, $\frac{3\pi}{2}$},
  ytick={-1,0.5,1}, yticklabels={$-1$, $0{,}5$, $1$}, ticklabel style={font=\small}]
  \addplot[domain=-2.1:5.4, samples=120, nbgray] {sin(deg(x))};
  \addplot[domain=-1.5708:1.5708, samples=60, very thick, nbblue] {sin(deg(x))};
  \addplot[domain=1.5708:4.7124, samples=60, very thick, nborange] {sin(deg(x))};
  \addplot[domain=-2.1:5.4, samples=2, aux] {0.5};
  \node[dot, nbblue] at (axis cs:0.5236,0.5) {};
  \node[dot, nborange] at (axis cs:2.618,0.5) {};
  \node[font=\small, nbblue, anchor=north west] at (axis cs:0.55,0.45) {$t = \arcsin 0{,}5$};
  \node[font=\small, nborange, anchor=south west] at (axis cs:2.7,0.55) {$t = \pi - \arcsin 0{,}5$};
\end{axis}
\end{tikzpicture}
```

::: {.remark #rem:lec17:dx tag="подводный камень"}
При замене меняется и дифференциал. «$\int \sqrt{1 - x^2}\,dx = \int \cos t\,dt = \sin t + C = x + C$» — неверно: забыт множитель $dx = \cos t\,dt$. Проверка дифференцированием сразу ловит ошибку: $(x + C)' = 1 \ne \sqrt{1 - x^2}$. Вторая частая ошибка — оставить ответ через $t$: неопределённый интеграл от функции переменной $x$ должен быть функцией от $x$.
:::

Как выбирать замену:

| Под интегралом | Замена |
| --- | --- |
| $\sqrt[m]{ax + b}$ | $t = \sqrt[m]{ax + b}$ |
| $\sqrt{a^2 - x^2}$ | $x = a\sin t$, $t \in \left(-\frac\pi2;\ \frac\pi2\right)$ |
| $\sqrt{a^2 + x^2}$ | $x = a\operatorname{tg} t$, $t \in \left(-\frac\pi2;\ \frac\pi2\right)$ |
| функция от $e^x$ | $t = e^x$ или $t = \sqrt{e^x \pm 1}$ |

Правило подстановки (теорема [-@thm:lec17:substitution]) и замена (теорема [-@thm:lec17:change]) — одна и та же формула, прочитанная в разные стороны. Если множитель $\varphi'(x)$ виден — его вносят под дифференциал; если нет — вводят новую переменную, которая упрощает «неудобную» часть.

## Расширенная таблица {#sec:lec17:table}

::: {.proposition #prop:lec17:table title="ещё четыре табличных интеграла"}
Пусть $a > 0$, $A \ne 0$. На каждом промежутке, где подынтегральная функция определена,

1. $\int \dfrac{dx}{x^2 + a^2} = \dfrac1a\operatorname{arctg}\dfrac xa + C$;
2. $\int \dfrac{dx}{x^2 - a^2} = \dfrac{1}{2a}\ln\left|\dfrac{x - a}{x + a}\right| + C$;
3. $\int \dfrac{dx}{\sqrt{a^2 - x^2}} = \arcsin\dfrac xa + C$;
4. $\int \dfrac{dx}{\sqrt{x^2 + A}} = \ln\left|x + \sqrt{x^2 + A}\right| + C$.
:::

::: proof
1 и 3 — линейная замена: $\frac{1}{x^2 + a^2} = \frac{1}{a^2} \cdot \frac{1}{1 + (x/a)^2}$, $\frac{1}{\sqrt{a^2 - x^2}} = \frac1a \cdot \frac{1}{\sqrt{1 - (x/a)^2}}$, и множитель $k = \frac1a$ в формуле $\frac1k F(kx)$ сокращает лишнее $\frac1a$. Пункт 2: $\frac{1}{x^2 - a^2} = \frac{1}{2a}\left(\frac{1}{x - a} - \frac{1}{x + a}\right)$, и по линейности $\frac{1}{2a}\left(\ln|x - a| - \ln|x + a|\right)$. Пункт 4 — дифференцированием: при $x + \sqrt{x^2 + A} \ne 0$
$$\left(\ln\left|x + \sqrt{x^2 + A}\right|\right)' = \frac{1 + \frac{x}{\sqrt{x^2 + A}}}{x + \sqrt{x^2 + A}} = \frac{\frac{\sqrt{x^2 + A} + x}{\sqrt{x^2 + A}}}{x + \sqrt{x^2 + A}} = \frac{1}{\sqrt{x^2 + A}}.$$
:::

Пример: $\int \frac{dx}{x^2 - 4} = \frac14\ln\left|\frac{x - 2}{x + 2}\right| + C$ на каждом из промежутков $(-\infty;\ -2)$, $(-2;\ 2)$, $(2;\ +\infty)$; $\int \frac{dx}{\sqrt{x^2 + 1}} = \ln\left(x + \sqrt{x^2 + 1}\right) + C$ на $\R$ (здесь $x + \sqrt{x^2 + 1} > 0$, модуль не нужен).

## Приём: дроби с квадратным трёхчленом {#sec:lec17:quadratic}

Приём для задач вида $\int \frac{Ax + B}{x^2 + px + q}\,dx$.

1. Выделить в числителе производную знаменателя: $Ax + B = \frac A2(2x + p) + \left(B - \frac{Ap}{2}\right)$. Первая часть даёт $\frac A2\ln|x^2 + px + q|$ (следствие [-@cor:lec17:log]).
2. В оставшемся $\int \frac{dx}{x^2 + px + q}$ выделить полный квадрат: $x^2 + px + q = \left(x + \frac p2\right)^2 + \left(q - \frac{p^2}{4}\right)$, и по знаку $q - \frac{p^2}{4}$ применить п. 1 или п. 2 утверждения [-@prop:lec17:table] к $t = x + \frac p2$ (если $q = \frac{p^2}{4}$, это $\int \frac{dt}{t^2} = -\frac1t$).

Тот же полный квадрат сводит $\int \frac{dx}{\sqrt{x^2 + px + q}}$ к п. 4, а $\int \frac{dx}{\sqrt{-x^2 + px + q}}$ — к п. 3.

::: {.example #ex:lec17:quadratic}
Найдём $\int \dfrac{3x + 1}{x^2 + 2x + 5}\,dx$.

*Ответ:* $\frac32\ln(x^2 + 2x + 5) - \operatorname{arctg}\frac{x + 1}{2} + C$.

*Решение.* Производная знаменателя $2x + 2$; $3x + 1 = \frac32(2x + 2) - 2$. Первая часть: $\frac32\ln(x^2 + 2x + 5)$ (знаменатель положителен, модуль не нужен). Вторая: $x^2 + 2x + 5 = (x + 1)^2 + 4$, и $-2\int \frac{d(x + 1)}{(x + 1)^2 + 2^2} = -2 \cdot \frac12\operatorname{arctg}\frac{x + 1}{2}$. Проверка: производная ответа $\frac{3x + 3}{x^2 + 2x + 5} - \frac{1/2}{1 + (x + 1)^2/4} = \frac{3x + 3 - 2}{x^2 + 2x + 5}$.
:::

Произвольную рациональную дробь $\frac{P(x)}{Q(x)}$ сводят к таким слагаемым и к $\frac{1}{(x - a)^k}$ разложением на простейшие дроби; это отдельный приём. Для знаменателей $(x^2 + px + q)^n$ понадобится рекуррентная формула из примера [-@ex:lec17:recurrence] ниже.

## Интегрирование по частям {#sec:lec17:parts}

Для $\int x e^x\,dx$ подстановка не помогает: множитель $x$ не производная от показателя. Вспомним правило произведения: $(x e^x)' = e^x + x e^x$. Значит, $x e^x = (x e^x)' - e^x$, и первообразная $x e^x$ равна $x e^x - e^x$. Это общий метод.

::: {.theorem #thm:lec17:parts title="интегрирование по частям"}
Пусть $u$ и $v$ дифференцируемы на интервале $I$ и функция $u'v$ имеет первообразную на $I$. Тогда $uv'$ тоже имеет первообразную на $I$ и
$$\int u(x)\,v'(x)\,dx = u(x)\,v(x) - \int u'(x)\,v(x)\,dx,$$ {#eq:lec17:parts}
или коротко $\int u\,dv = uv - \int v\,du$.
:::

::: proof
Пусть $H$ — первообразная $u'v$. По правилу произведения (теорема [-@thm:lec12:arithmetic]) $(uv - H)' = u'v + uv' - u'v = uv'$. Значит, $uv - H$ — первообразная $uv'$, и обе части [-@eq:lec17:parts] — одно и то же множество $uv - H + C$.
:::

Пример: $\int x e^x\,dx$, $u = x$, $dv = e^x\,dx$, $v = e^x$: $x e^x - \int e^x\,dx = (x - 1)e^x + C$. Проверка: $\left((x - 1)e^x\right)' = e^x + (x - 1)e^x = x e^x$. В качестве $v$ годится любая первообразная $v'$: с $v = e^x + 5$ получится $x(e^x + 5) - \int (e^x + 5)\,dx = x e^x + 5x - e^x - 5x + C$ — то же самое. Поэтому постоянную при нахождении $v$ не пишут.

Метод выгоден, когда $\int v\,du$ проще исходного. Это определяет выбор $u$:

| Вид интеграла | $u$ | $dv$ |
| --- | --- | --- |
| $P(x)e^{ax}$, $P(x)\sin ax$, $P(x)\cos ax$ ($P$ — многочлен) | $P(x)$: степень понижается | остальное |
| $P(x)\ln x$, $P(x)\operatorname{arctg} x$, $P(x)\arcsin x$ | $\ln x$, $\operatorname{arctg} x$, $\arcsin x$: производная алгебраическая | $P(x)\,dx$ |
| $e^{ax}\sin bx$, $e^{ax}\cos bx$ | любой из множителей, два раза подряд | |

Если в $P(x)e^x$ взять $u = e^x$, $dv = x\,dx$, получится $\frac{x^2}{2}e^x - \int \frac{x^2}{2}e^x\,dx$ — степень выросла, интеграл стал сложнее. При многочлене степени $n$ интегрировать по частям приходится $n$ раз.

::: {.example #ex:lec17:parts}
Найдём $\int \ln x\,dx$ и $\int \operatorname{arctg} x\,dx$.

*Ответ:* $x\ln x - x + C$; $x\operatorname{arctg} x - \frac12\ln(1 + x^2) + C$.

*Решение.* *Ключ:* «многочлен» здесь — $1$, и $dv = dx$, $v = x$. Для логарифма: $u = \ln x$, $du = \frac{dx}{x}$; $x\ln x - \int x \cdot \frac1x\,dx = x\ln x - x$. Для арктангенса: $u = \operatorname{arctg} x$, $du = \frac{dx}{1 + x^2}$; $x\operatorname{arctg} x - \int \frac{x\,dx}{1 + x^2}$, а последний интеграл — $\frac12\ln(1 + x^2)$ (следствие [-@cor:lec17:log]).
:::

::: {.example #ex:lec17:cyclic}
Найдём $\int e^x\cos x\,dx$.

*Ответ:* $\frac12 e^x(\sin x + \cos x) + C$.

*Решение.* Пусть $F$ — какая-нибудь первообразная $e^x\cos x$. По частям с $u = \cos x$, $dv = e^x\,dx$, а затем ещё раз с $u = \sin x$, $dv = e^x\,dx$:
$$\begin{aligned} \int e^x\cos x\,dx &= e^x\cos x + \int e^x\sin x\,dx, \\ \int e^x\sin x\,dx &= e^x\sin x - \int e^x\cos x\,dx. \end{aligned}$$
 *Ключ:* интеграл вернулся к исходному, и получилось уравнение на $F$:
$$F(x) = e^x\cos x + e^x\sin x - F(x) + C_1$$
с некоторой постоянной $C_1$. Отсюда $F = \frac12 e^x(\sin x + \cos x) + \frac{C_1}{2}$. Проверка:
$$\left(\tfrac12 e^x(\sin x + \cos x)\right)' = \tfrac12 e^x(\sin x + \cos x) + \tfrac12 e^x(\cos x - \sin x) = e^x\cos x.$$
:::

::: {.remark #rem:lec17:paradox tag="подводный камень"}
Почему в примере [-@ex:lec17:cyclic] появилась постоянная $C_1$. Возьмём $\int \frac{dx}{x}$ по частям с $u = \frac1x$, $dv = dx$: $\int \frac{dx}{x} = x \cdot \frac1x - \int x \cdot \left(-\frac{1}{x^2}\right)dx = 1 + \int \frac{dx}{x}$. «Сократив» интегралы, получим $0 = 1$. Ошибки в выкладке нет, ошибка в сокращении: $\int \frac{dx}{x}$ — множество функций $\ln|x| + C$, и множество $1 + (\ln|x| + C)$ совпадает с ним самим (замечание [-@rem:lec16:different-answers]). Вычитать интегралы как числа нельзя. Правильно — работать с одной конкретной первообразной $F$: тогда равенство справедливо с точностью до постоянной, $F = 1 + F + C_1$, и $C_1 = -1$ — никакого противоречия. В циклических интегралах уравнение решается так же, с постоянной.
:::

::: {.example #ex:lec17:recurrence}
Для $I_n = \int \frac{dx}{(x^2 + 1)^n}$ докажем рекуррентную формулу
$$I_{n+1} = \frac{x}{2n(x^2 + 1)^n} + \frac{2n - 1}{2n}I_n, \qquad n \in \N,$$ {#eq:lec17:recurrence}
и найдём $I_2$.

*Ответ:* $I_2 = \frac{x}{2(x^2 + 1)} + \frac12\operatorname{arctg} x + C$.

*Решение.* По частям с $u = (x^2 + 1)^{-n}$, $dv = dx$: $du = -2nx(x^2 + 1)^{-n-1}\,dx$, $v = x$, и
$$I_n = \frac{x}{(x^2 + 1)^n} + 2n\int \frac{x^2\,dx}{(x^2 + 1)^{n+1}}.$$
*Ключ:* в числителе $x^2 = (x^2 + 1) - 1$, поэтому последний интеграл равен $I_n - I_{n+1}$. Получаем $I_n = \frac{x}{(x^2 + 1)^n} + 2n I_n - 2n I_{n+1}$ (равенство первообразных с точностью до постоянной, как в замечании [-@rem:lec17:paradox]); выражаем $I_{n+1}$. При $n = 1$, $I_1 = \operatorname{arctg} x + C$: $I_2 = \frac{x}{2(x^2 + 1)} + \frac12\operatorname{arctg} x + C$. Проверка: $\left(\frac{x}{2(x^2 + 1)}\right)' = \frac{1 - x^2}{2(x^2 + 1)^2}$, плюс $\frac{1}{2(x^2 + 1)} = \frac{x^2 + 1}{2(x^2 + 1)^2}$, сумма $\frac{1}{(x^2 + 1)^2}$.
:::

Итог по методам — что делать, увидев интеграл:

| Признак | Метод |
| --- | --- |
| есть множитель, равный (с точностью до числа) производной «внутренней» функции | внести под знак дифференциала |
| корень из линейной функции, $\sqrt{a^2 \pm x^2}$, функция от $e^x$ | замена переменной |
| произведение многочлена на $e^{ax}$, $\sin$, $\cos$, $\ln$, $\operatorname{arctg}$, $\arcsin$ | по частям |
| дробь $\frac{Ax + B}{x^2 + px + q}$ | производная знаменателя + полный квадрат |

# Практика

## Внесение под знак дифференциала

::: {.problem #prob:lec17:differential}
Найдите интегралы: (a) $\int \dfrac{x\,dx}{\sqrt{1 - x^4}}$; (b) $\int \dfrac{\cos x\,dx}{1 + \sin^2 x}$; (c) $\int \dfrac{dx}{x\ln^2 x}$; (d) $\int \cos^3 x\,dx$; (e) $\int \dfrac{e^{2x}\,dx}{1 + e^{4x}}$; (f) $\int \operatorname{ctg} x\,dx$.
:::

::: answer
\(a) $\frac12\arcsin x^2 + C$; (b) $\operatorname{arctg}(\sin x) + C$; (c) $-\frac{1}{\ln x} + C$; (d) $\sin x - \frac{\sin^3 x}{3} + C$; (e) $\frac12\operatorname{arctg} e^{2x} + C$; (f) $\ln|\sin x| + C$.
:::

::: solution
\(a) *Ключ:* $x^4 = (x^2)^2$ и $x\,dx = \frac12\,d(x^2)$: $\frac12\int \frac{d(x^2)}{\sqrt{1 - (x^2)^2}} = \frac12\arcsin x^2$ (на $(-1;\ 1)$).

\(b) $\cos x\,dx = d(\sin x)$: $\int \frac{d(\sin x)}{1 + \sin^2 x} = \operatorname{arctg}(\sin x)$.

\(c) $\frac{dx}{x} = d(\ln x)$: $\int (\ln x)^{-2}\,d(\ln x) = -(\ln x)^{-1}$ на $(0;\ 1)$ и на $(1;\ +\infty)$ отдельно.

\(d) Нечётная степень косинуса: $\cos^3 x\,dx = (1 - \sin^2 x)\,d(\sin x)$.

\(e) $e^{2x}\,dx = \frac12\,d(e^{2x})$, а $e^{4x} = (e^{2x})^2$: $\frac12\int \frac{d(e^{2x})}{1 + (e^{2x})^2}$.

\(f) $\operatorname{ctg} x = \frac{(\sin x)'}{\sin x}$, следствие [-@cor:lec17:log]; ответ — на каждом интервале $(\pi k;\ \pi(k + 1))$.
:::

## Замена переменной

::: {.problem #prob:lec17:change}
Найдите интегралы: (a) $\int \sqrt{e^x - 1}\,dx$; (b) $\int x\sqrt{x - 1}\,dx$; (c) $\int \dfrac{dx}{x^2\sqrt{1 + x^2}}$.
:::

::: answer
\(a) $2\sqrt{e^x - 1} - 2\operatorname{arctg}\sqrt{e^x - 1} + C$; (b) $\frac25(x - 1)^{5/2} + \frac23(x - 1)^{3/2} + C$; (c) $-\frac{\sqrt{1 + x^2}}{x} + C$.
:::

::: solution
\(a) *Ключ:* заменить весь корень: $t = \sqrt{e^x - 1}$, $t > 0$ при $x > 0$. Тогда $x = \ln(1 + t^2)$ — строго возрастающая функция $t$, $dx = \frac{2t\,dt}{1 + t^2}$, и
$$\int t \cdot \frac{2t\,dt}{1 + t^2} = \int \left(2 - \frac{2}{1 + t^2}\right)dt = 2t - 2\operatorname{arctg} t + C.$$
Проверка: $\left(2\sqrt{e^x - 1}\right)' = \frac{e^x}{\sqrt{e^x - 1}}$, $\left(2\operatorname{arctg}\sqrt{e^x - 1}\right)' = \frac{2}{e^x} \cdot \frac{e^x}{2\sqrt{e^x - 1}} = \frac{1}{\sqrt{e^x - 1}}$, разность $\frac{e^x - 1}{\sqrt{e^x - 1}} = \sqrt{e^x - 1}$.

\(b) $t = \sqrt{x - 1}$, $x = t^2 + 1$, $dx = 2t\,dt$: $\int (t^2 + 1)\,t \cdot 2t\,dt = \int (2t^4 + 2t^2)\,dt = \frac{2t^5}{5} + \frac{2t^3}{3}$. Проверка: производная ответа $(x - 1)^{3/2} + (x - 1)^{1/2} = (x - 1)^{1/2}\big((x - 1) + 1\big) = x\sqrt{x - 1}$. (Можно и по частям, с $u = x$.)

\(c) *Ключ:* $\sqrt{1 + x^2}$ — замена $x = \operatorname{tg} t$, $t \in \left(-\frac\pi2;\ \frac\pi2\right)$, $t \ne 0$; там $\cos t > 0$ и $\sqrt{1 + \operatorname{tg}^2 t} = \frac{1}{\cos t}$, $dx = \frac{dt}{\cos^2 t}$:
$$\int \frac{dt/\cos^2 t}{\operatorname{tg}^2 t / \cos t} = \int \frac{\cos t\,dt}{\sin^2 t} = \int \frac{d(\sin t)}{\sin^2 t} = -\frac{1}{\sin t} + C.$$
Возвращаемся: $\sin t = \operatorname{tg} t\cos t = \frac{x}{\sqrt{1 + x^2}}$. Ответ верен на каждом из лучей $x < 0$ и $x > 0$.
:::

## По частям

::: {.problem #prob:lec17:parts}
Найдите интегралы: (a) $\int x^2 e^{-x}\,dx$; (b) $\int x\operatorname{arctg} x\,dx$; (c) $\int \arcsin x\,dx$; (d) $\int e^{2x}\sin 3x\,dx$.
:::

::: answer
\(a) $-e^{-x}(x^2 + 2x + 2) + C$; (b) $\frac{x^2 + 1}{2}\operatorname{arctg} x - \frac x2 + C$; (c) $x\arcsin x + \sqrt{1 - x^2} + C$; (d) $\frac{e^{2x}}{13}(2\sin 3x - 3\cos 3x) + C$.
:::

::: solution
\(a) Дважды по частям с $u$ — многочлен. $u = x^2$, $v = -e^{-x}$: $-x^2 e^{-x} + 2\int x e^{-x}\,dx$; $u = x$: $\int x e^{-x}\,dx = -x e^{-x} + \int e^{-x}\,dx = -(x + 1)e^{-x}$. Итого $-x^2 e^{-x} - 2(x + 1)e^{-x}$. Проверка: $\left(-e^{-x}(x^2 + 2x + 2)\right)' = e^{-x}(x^2 + 2x + 2) - e^{-x}(2x + 2) = x^2 e^{-x}$.

\(b) $u = \operatorname{arctg} x$, $dv = x\,dx$. *Ключ:* в качестве $v$ взять не $\frac{x^2}{2}$, а $\frac{x^2 + 1}{2}$ — это тоже первообразная $x$, и тогда $v\,du = \frac{x^2 + 1}{2} \cdot \frac{dx}{1 + x^2} = \frac{dx}{2}$. Получаем $\frac{x^2 + 1}{2}\operatorname{arctg} x - \frac x2$.

\(c) $u = \arcsin x$, $v = x$: $x\arcsin x - \int \frac{x\,dx}{\sqrt{1 - x^2}}$, а $\int \frac{x\,dx}{\sqrt{1 - x^2}} = -\frac12\int (1 - x^2)^{-1/2}\,d(1 - x^2) = -\sqrt{1 - x^2}$.

\(d) Циклический интеграл. Пусть $F$ — первообразная. $u = \sin 3x$, $v = \frac12 e^{2x}$: $\frac12 e^{2x}\sin 3x - \frac32\int e^{2x}\cos 3x\,dx$; ещё раз $u = \cos 3x$: $\int e^{2x}\cos 3x\,dx = \frac12 e^{2x}\cos 3x + \frac32\int e^{2x}\sin 3x\,dx$. Получаем $F = \frac12 e^{2x}\sin 3x - \frac34 e^{2x}\cos 3x - \frac94 F + C_1$, откуда $\frac{13}{4}F = \frac{e^{2x}}{4}(2\sin 3x - 3\cos 3x) + C_1$. Проверка: производная ответа $\frac{e^{2x}}{13}\big(2(2\sin 3x - 3\cos 3x) + (6\cos 3x + 9\sin 3x)\big) = e^{2x}\sin 3x$.
:::

## Дроби с квадратным трёхчленом

::: {.problem #prob:lec17:quadratic}
Найдите интегралы: (a) $\int \dfrac{dx}{x^2 - 6x + 13}$; (b) $\int \dfrac{x - 1}{x^2 + 4x + 3}\,dx$; (c) $\int \dfrac{dx}{\sqrt{x^2 + 2x + 5}}$.
:::

::: answer
\(a) $\frac12\operatorname{arctg}\frac{x - 3}{2} + C$; (b) $2\ln|x + 3| - \ln|x + 1| + C$; (c) $\ln\left(x + 1 + \sqrt{x^2 + 2x + 5}\right) + C$.
:::

::: solution
\(a) $x^2 - 6x + 13 = (x - 3)^2 + 4$, п. 1 утверждения [-@prop:lec17:table] с $a = 2$.

\(b) По приёму: $x - 1 = \frac12(2x + 4) - 3$, $x^2 + 4x + 3 = (x + 2)^2 - 1$:
$$\frac12\ln|x^2 + 4x + 3| - 3 \cdot \frac12\ln\left|\frac{x + 1}{x + 3}\right| = \frac12\big(\ln|x + 1| + \ln|x + 3|\big) - \frac32\ln|x + 1| + \frac32\ln|x + 3|.$$
*Ключ:* при положительном дискриминанте знаменатель раскладывается, $(x + 1)(x + 3)$, и быстрее сразу разложить дробь: $\frac{x - 1}{(x + 1)(x + 3)} = \frac{\alpha}{x + 1} + \frac{\beta}{x + 3}$, $x - 1 = \alpha(x + 3) + \beta(x + 1)$; при $x = -1$: $\alpha = -1$, при $x = -3$: $\beta = 2$. Ответ тот же: $-\ln|x + 1| + 2\ln|x + 3|$ на каждом из промежутков $(-\infty;\ -3)$, $(-3;\ -1)$, $(-1;\ +\infty)$.

\(c) $x^2 + 2x + 5 = (x + 1)^2 + 4$, п. 4 утверждения [-@prop:lec17:table] с $A = 4$ для $t = x + 1$; выражение $x + 1 + \sqrt{(x + 1)^2 + 4}$ положительно.
:::

## Кусочно заданные функции

Приём для задач «найдите все первообразные функции на $\R$»: найти первообразную на каждом промежутке, где функция задана одной формулой, и подобрать постоянные так, чтобы склейка была непрерывной (первообразная дифференцируема, значит, непрерывна). Остаётся одна общая постоянная $C$. В точках склейки производная существует, если сама функция там непрерывна (следствие [-@cor:lec13:derivative-limit]).

::: {.problem #prob:lec17:piecewise}
Найдите все первообразные функции $f(x) = \max(1, x^2)$ на $\R$.
:::

::: answer
$F(x) = \frac{x^3}{3} - \frac23 + C$ при $x < -1$; $F(x) = x + C$ при $|x| \le 1$; $F(x) = \frac{x^3}{3} + \frac23 + C$ при $x > 1$.
:::

::: solution
$f(x) = 1$ при $|x| \le 1$ и $x^2$ при $|x| > 1$. На $(-1;\ 1)$: $F = x + C$. На $(1;\ +\infty)$: $F = \frac{x^3}{3} + C_1$; *ключ:* непрерывность в точке $1$: $1 + C = \frac13 + C_1$, $C_1 = C + \frac23$. На $(-\infty;\ -1)$: $F = \frac{x^3}{3} + C_2$, в точке $-1$: $-1 + C = -\frac13 + C_2$, $C_2 = C - \frac23$. Функция $f$ непрерывна (в точках $\pm 1$ обе формулы дают $1$), поэтому склеенная $F$ дифференцируема и в точках $\pm 1$: по следствию [-@cor:lec13:derivative-limit] односторонние производные равны пределам $f$, то есть $1$. Без согласования постоянных $F$ имела бы скачки и не была бы первообразной.
:::

# Итоги

- Подстановка: если $F' = f$, то $\int f(\varphi(x))\varphi'(x)\,dx = F(\varphi(x)) + C$ — в табличной формуле $x$ можно заменить на $\varphi(x)$, если рядом стоит $d\varphi(x) = \varphi'(x)\,dx$; в частности, $\int \frac{\varphi'}{\varphi}\,dx = \ln|\varphi| + C$.
- Замена $x = \varphi(t)$ требует строго монотонной $\varphi$ с $\varphi' \ne 0$: только тогда можно вернуться к $x$; дифференциал пересчитывается, $dx = \varphi'(t)\,dt$, а промежуток для $t$ определяет знак корня.
- По частям: $\int u\,dv = uv - \int v\,du$ — правило произведения справа налево; $u$ выбирают так, чтобы $du$ было проще $u$ (многочлен, $\ln$, $\operatorname{arctg}$), а $v$ — любую первообразную.
- Если интеграл после двух интегрирований по частям вернулся к себе, получается уравнение на первообразную, верное с точностью до постоянной; вычитать неопределённые интегралы как числа нельзя — иначе выйдет «$0 = 1$».
- Дробь $\frac{Ax + B}{x^2 + px + q}$ интегрируется выделением производной знаменателя (логарифм) и полного квадрата (арктангенс или логарифм отношения).
- Первообразная кусочной функции на прямой собирается из первообразных кусков с согласованными постоянными: она обязана быть непрерывной.

# Глоссарий

Внесение под знак дифференциала
:   запись множителя $\varphi'(x)\,dx$ как $d\varphi(x)$, после которой работает табличная формула с $\varphi(x)$ вместо $x$; [-@thm:lec17:substitution].

Замена переменной
:   переход к новой переменной $x = \varphi(t)$ ($\varphi$ строго монотонна, $\varphi' \ne 0$): $\int f(x)\,dx = G(\varphi^{-1}(x)) + C$, где $G' = f(\varphi(t))\varphi'(t)$; [-@thm:lec17:change].

Интегрирование по частям
:   $\int u\,dv = uv - \int v\,du$; [-@thm:lec17:parts].

$\ln\left|x + \sqrt{x^2 + A}\right|$
:   первообразная $\frac{1}{\sqrt{x^2 + A}}$ («длинный логарифм»); [-@prop:lec17:table].

# Самопроверка

1. Найдите $\int x\cos(x^2)\,dx$.
2. Найдите $\int \frac{e^x}{e^x + 1}\,dx$ и $\int \frac{\sin x}{\cos^2 x}\,dx$.
3. Где ошибка: «$\int x e^{x^2}\,dx = \int e^{x^2}\,d(x^2) = e^{x^2} + C$»?
4. Найдите $\int \dfrac{dx}{x + \sqrt x}$ заменой $t = \sqrt x$.
5. Где ошибка: «$\int \sqrt{1 - x^2}\,dx$, $x = \sin t$, $= \int \cos t\,dt = \sin t + C = x + C$»?
6. Почему при замене $x = \sin t$ берут $t \in \left(-\frac\pi2;\ \frac\pi2\right)$, а не $t \in \R$?
7. Найдите $\int x\ln x\,dx$ и $\int x\sin x\,dx$.
8. Что нужно взять за $u$ в $\int x^3\ln x\,dx$? Найдите интеграл.
9. Найдите $\int e^x\sin x\,dx$.
10. Объясните, почему из $\int \frac{dx}{x} = 1 + \int \frac{dx}{x}$ не следует $0 = 1$.
11. Найдите $\int \dfrac{dx}{x^2 + 9}$, $\int \dfrac{dx}{x^2 - 9}$ и $\int \dfrac{dx}{x^2 + 4x + 8}$.
12. Найдите $\int \dfrac{2x + 3}{x^2 + 1}\,dx$.
13. Найдите все первообразные функции $|x - 1|$ на $\R$.

::: answers
1. $\frac12\sin(x^2) + C$ ($x\,dx = \frac12\,d(x^2)$).
2. $\ln(e^x + 1) + C$; $\frac{1}{\cos x} + C$ ($\sin x\,dx = -d(\cos x)$, $-\int t^{-2}\,dt = \frac1t$).
3. $x\,dx = \frac12\,d(x^2)$, а не $d(x^2)$: верный ответ $\frac12 e^{x^2} + C$ (замечание [-@rem:lec17:factor]).
4. $x = t^2$, $dx = 2t\,dt$: $\int \frac{2t\,dt}{t^2 + t} = 2\ln(1 + t)$, ответ $2\ln(1 + \sqrt x) + C$.
5. Забыт множитель $dx = \cos t\,dt$ (замечание [-@rem:lec17:dx]); верный ответ — пример [-@ex:lec17:circle].
6. На $\R$ синус не монотонен, и обратная замена $t = \arcsin x$ определена только на $\left[-\frac\pi2;\ \frac\pi2\right]$; там же $\sqrt{1 - \sin^2 t} = \cos t$ без модуля.
7. $\frac{x^2}{2}\ln x - \frac{x^2}{4} + C$; $-x\cos x + \sin x + C$.
8. $u = \ln x$, $dv = x^3\,dx$: $\frac{x^4}{4}\ln x - \frac{x^4}{16} + C$.
9. $\frac12 e^x(\sin x - \cos x) + C$.
10. Неопределённый интеграл — множество функций, и $1 + (\ln|x| + C)$ — то же множество; для конкретной первообразной равенство верно с точностью до постоянной (замечание [-@rem:lec17:paradox]).
11. $\frac13\operatorname{arctg}\frac x3 + C$; $\frac16\ln\left|\frac{x - 3}{x + 3}\right| + C$; $\frac12\operatorname{arctg}\frac{x + 2}{2} + C$.
12. $\ln(x^2 + 1) + 3\operatorname{arctg} x + C$.
13. $\frac{(x - 1)|x - 1|}{2} + C$: при $x \ge 1$ это $\frac{(x - 1)^2}{2}$, при $x < 1$ — $-\frac{(x - 1)^2}{2}$, склейка в точке $1$ непрерывна.
:::
