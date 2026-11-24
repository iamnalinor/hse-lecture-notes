---
course: calculus
title: "Подготовка к квизу 5: подсчёт пределов"
quiz_number: 5                 # из таблицы планирования context/courses/calculus.md (неделя 12: Quiz5)
quiz_topic: "подсчёт пределов" # имя на сайте: «Квиз 5 (подсчёт пределов)»
date: 2026-11-30               # неделя квиза 30 ноября – 4 декабря, день не назван: первый день недели
active_until: 2026-12-04       # последний день той же недели
highlight_from: 2026-11-27     # выделять цветом с пятницы перед неделей квиза
---

# О квизе

Квиз по подсчёту пределов функций — на неделе 30 ноября – 4 декабря. Задачи — тех же типов, что задача 1 семинара 9 и задачи 2–3 семинара 10 (и соответствующие задачи из домашних заданий и задач для самостоятельного решения).

# Задачи

## 1. Замена множителей на эквивалентные и сдвиг точки {#sec:quiz-limits:equiv}

1. Сначала проверьте тип неопределённости: заменять на эквивалентные имеет смысл, когда множители стремятся к $0$ (таблица [-@prop:lec09:table] и следствие [-@cor:lec11:arc-limits]: при $u \to 0$ имеем $\sin u \sim \operatorname{tg} u \sim \arcsin u \sim \operatorname{arctg} u \sim \ln(1 + u) \sim e^u - 1 \sim u$, $1 - \cos u \sim \frac{u^2}{2}$, $(1 + u)^\alpha - 1 \sim \alpha u$ при $\alpha \ne 0$, $a^u - 1 \sim u\ln a$ при $a > 0$, $a \ne 1$).
2. Если $x \to x_0 \ne 0$, сделайте замену $t = x - x_0 \to 0$ (теорема о пределе сложной функции [-@thm:lec07:composite]). Так $\ln x = \ln(1 + t) \sim t$ при $x \to 1$, $a^x - a = a(a^t - 1) \sim a t \ln a$, $\cos x = \sin(\frac{\pi}{2} - x) \sim \frac{\pi}{2} - x$ при $x \to \frac{\pi}{2}$.
3. Заменяйте на эквивалентные *только* множители в произведении и частном (теорема [-@thm:lec09:replacement]). Внутри композиции (например, $\operatorname{arctg}(\sin x)$ или $e^{\sin 3x} - 1$) применяйте подстановку [-@prop:lec09:substitution], предварительно убедившись, что аргумент стремится к $0$ и отличен от нуля около точки.
4. Разность или сумму в числителе или знаменателе сначала сверните в произведение (вынесение общего множителя, формула разности синусов/косинусов, $\sin 4x - 2\sin 2x = 2\sin 2x(\cos 2x - 1)$), и только потом заменяйте множители.

::: {.problem #prob:quiz-limits:equiv-zero}
Вычислите предел
$$\lim_{x \to 0} \frac{\ln(1 + \operatorname{tg}^2 3x)\,(e^{2x^2} - 1)}{\bigl(\sqrt{1 + 4x^2} - 1\bigr)\,(1 - \cos 2x)}.$$
:::

::: solution
Все четыре множителя стремятся к $0$ при $x \to 0$ и не обращаются в ноль в проколотой окрестности нуля. Заменим каждый эквивалентным (таблица [-@prop:lec09:table], подстановка [-@prop:lec09:substitution]): $\operatorname{tg} 3x \sim 3x \Rightarrow \operatorname{tg}^2 3x \sim 9x^2 \to 0$, откуда $\ln(1 + \operatorname{tg}^2 3x) \sim 9x^2$; $e^{2x^2} - 1 \sim 2x^2$; $\sqrt{1 + 4x^2} - 1 = (1 + 4x^2)^{1/2} - 1 \sim \frac12 \cdot 4x^2 = 2x^2$; $1 - \cos 2x \sim \frac{(2x)^2}{2} = 2x^2$. По теореме [-@thm:lec09:replacement]
$$\lim_{x \to 0} \frac{\ln(1 + \operatorname{tg}^2 3x)\,(e^{2x^2} - 1)}{\bigl(\sqrt{1 + 4x^2} - 1\bigr)\,(1 - \cos 2x)} = \lim_{x \to 0} \frac{9x^2 \cdot 2x^2}{2x^2 \cdot 2x^2} = \frac{18}{4} = \frac92.$$

*Ответ:* $\dfrac92$.
:::

::: {.problem #prob:quiz-limits:equiv-shift}
Вычислите предел
$$\lim_{x \to 1} \frac{\bigl(1 - \cos(2x - 2)\bigr)\,\operatorname{arctg}(x^3 - 1)}{\ln x \cdot (3^x - 3)\,(x^2 - 1)}.$$
:::

::: solution
*Ключ:* сдвинуть точку в ноль заменой $t = x - 1 \to 0$ ($x = 1 + t$). В числителе и знаменателе: $1 - \cos(2x - 2) = 1 - \cos 2t \sim 2t^2$; $x^3 - 1 = t(x^2 + x + 1) \sim 3t$ (так как $x^2 + x + 1 \to 3$), откуда $\operatorname{arctg}(x^3 - 1) \sim 3t$ (следствие [-@cor:lec11:arc-limits], утверждение [-@prop:lec09:substitution]); $\ln x = \ln(1 + t) \sim t$; $3^x - 3 = 3(3^t - 1) \sim 3t\ln 3$; $x^2 - 1 = t(x + 1) \sim 2t$. По теореме [-@thm:lec09:replacement]
$$\lim_{x \to 1} \frac{\bigl(1 - \cos(2x - 2)\bigr)\,\operatorname{arctg}(x^3 - 1)}{\ln x \cdot (3^x - 3)\,(x^2 - 1)} = \lim_{t \to 0} \frac{2t^2 \cdot 3t}{t \cdot (3t\ln 3) \cdot 2t} = \frac{1}{\ln 3}.$$

*Ответ:* $\dfrac{1}{\ln 3}$.
:::

Ещё задачи: [-@prob:lec09:limits], [-@prob:lec09:equiv-shift-and-log], [-@prob:lec08:trig-shift], [-@prob:lec11:limits].

## 2. Суммы и разности через $o$-разложения {#sec:quiz-limits:o-diff}

1. В суммах и разностях нельзя молча заменять слагаемые на эквивалентные (замечание [-@rem:lec09:sums]): перепишите каждое слагаемое через $o$ по теореме [-@thm:lec09:equiv-o] ($f \sim g \Leftrightarrow f = g + o(g)$): при $u \to 0$ имеем $\sin u = u + o(u)$, $\operatorname{tg} u = u + o(u)$, $\arcsin u = u + o(u)$, $\operatorname{arctg} u = u + o(u)$, $\ln(1 + u) = u + o(u)$, $e^u = 1 + u + o(u)$, $(1 + u)^\alpha = 1 + \alpha u + o(u)$, $\cos u = 1 - \frac{u^2}{2} + o(u^2)$.
2. Слагаемые более высокого порядка ($x^2, \operatorname{tg}^2 x$ рядом с $x$) сразу уходят в $o(x)$; внутри $\ln(\dots)$ выделите единицу (например, $\ln(x^2 + e^x) = \ln(1 + x + o(x))$). Если после приведения подобных старший член обнулился ($0 \cdot x + o(x)$), такого разложения мало — нужно алгебраическое преобразование (вынесение множителя, логарифм произведения, сопряжённое).
3. Для разности показательных $e^{a(x)} - e^{b(x)}$ с $a(x), b(x) \to 0$ и $a \ne b$ около точки вынесите $e^{b(x)}$: $e^{a} - e^{b} = e^{b}\bigl(e^{a - b} - 1\bigr) \sim a - b$ (так как $e^b \to 1$).
4. При $x \to \infty$ сделайте замену $t = \frac1x \to 0$: выражения вида $\cos\frac{c}{x}$ или $a^{1/x}$ переходят в стандартные разложения около нуля.
5. В конце разделите числитель и знаменатель на ведущую степень и примените $\frac{o(x^n)}{x^n} \to 0$ (замечание [-@rem:lec09:o-limit]).

::: {.problem #prob:quiz-limits:o-roots}
Вычислите предел
$$\lim_{x \to 0} \frac{\sqrt[3]{1 + 6x} - \sqrt{1 + 2\sin x}}{\ln(1 + 5x) - \operatorname{tg} 2x}.$$
:::

::: solution
Запишем каждое слагаемое через $o(x)$ при $x \to 0$ (таблица [-@prop:lec09:table], теорема [-@thm:lec09:equiv-o] и подстановка [-@prop:lec09:substitution]): $\sqrt[3]{1 + 6x} = (1 + 6x)^{1/3} = 1 + 2x + o(x)$; так как $2\sin x = 2x + o(x) \sim 2x$, имеем $o(2\sin x) = o(x)$ и $\sqrt{1 + 2\sin x} = 1 + \frac12(2\sin x) + o(2\sin x) = 1 + x + o(x)$; в знаменателе $\ln(1 + 5x) = 5x + o(x)$ и $\operatorname{tg} 2x = 2x + o(x)$.

*Ключ:* в числителе единицы сокращаются, но коэффициент при $x$ остаётся ненулевым ($2 - 1 = 1 \ne 0$); в знаменателе $5 - 2 = 3 \ne 0$:
$$\lim_{x \to 0} \frac{(1 + 2x + o(x)) - (1 + x + o(x))}{(5x + o(x)) - (2x + o(x))} = \lim_{x \to 0} \frac{x + o(x)}{3x + o(x)} = \lim_{x \to 0} \frac{1 + \frac{o(x)}{x}}{3 + \frac{o(x)}{x}} = \frac13.$$

*Ответ:* $\dfrac13$.
:::

::: {.problem #prob:quiz-limits:o-infinity}
Вычислите предел
$$\lim_{x \to \infty} x^2 \left(e^{3/x^2} - \cos \frac{2}{x}\right).$$
:::

::: solution
Сделаем замену $t = \frac1x \to 0$ ($t \ne 0$); по теореме [-@thm:lec07:composite] предел равен $\lim\limits_{t \to 0} \frac{e^{3t^2} - \cos 2t}{t^2}$. Разложим оба слагаемых до $o(t^2)$ (таблица [-@prop:lec09:table], теорема [-@thm:lec09:equiv-o] и подстановка [-@prop:lec09:substitution]):
$$e^{3t^2} = 1 + 3t^2 + o(t^2), \qquad \cos 2t = 1 - \frac{(2t)^2}{2} + o(t^2) = 1 - 2t^2 + o(t^2).$$
*Ключ:* в разности единицы сокращаются, а квадратичные члены складываются:
$$\lim_{t \to 0} \frac{(1 + 3t^2 + o(t^2)) - (1 - 2t^2 + o(t^2))}{t^2} = \lim_{t \to 0} \frac{5t^2 + o(t^2)}{t^2} = \lim_{t \to 0} \left(5 + \frac{o(t^2)}{t^2}\right) = 5.$$

*Ответ:* $5$.
:::

Ещё задачи: [-@prob:lec09:o-sums-limits], [-@prob:lec09:main-part], [-@prob:lec08:classic], [-@prob:lec09:equiv-shift-and-log].

## 3. Показательно-степенные пределы вида $1^\infty$ {#sec:quiz-limits:power-exp}

1. Если в $f(x)^{g(x)}$ основание $f(x) \to 1$, а показатель $g(x) \to \infty$, это неопределённость $1^\infty$ (если $f \to A > 0$ и $g \to B \in \R$, неопределённости нет: предел равен $A^B$ по следствию [-@cor:lec11:power-limit]).
2. Перепишите выражение через экспоненту: $f(x)^{g(x)} = e^{g(x)\ln f(x)}$ (при $f(x) > 0$ около точки).
3. Выделите в основании единицу: $f(x) = 1 + \alpha(x)$, где $\alpha(x) = f(x) - 1 \to 0$. Если $\alpha(x) \ne 0$ около точки, замените $\ln(1 + \alpha(x)) \sim \alpha(x)$ (таблица [-@prop:lec09:table] и утверждение [-@prop:lec09:substitution]): предел показателя сводится к $\lim g(x)\bigl(f(x) - 1\bigr) = L$. (В точках, где $f(x) = 1$, оба выражения $g\ln f$ и $g(f - 1)$ равны нулю.)
4. Вычислите $L$ (эквивалентности, деление на старшую степень, сдвиг точки) и верните экспоненту (теорема [-@thm:lec11:exp]): при $L \in \R$ предел равен $e^L$, при $L = +\infty$ — $+\infty$, при $L = -\infty$ — $0$; если $g(f - 1) \to \infty$ без знака (например, $e^{1/x}$ при $x \to 0$), проверьте односторонние пределы отдельно.

::: {.problem #prob:quiz-limits:power-rational}
Вычислите предел
$$\lim_{x \to \infty} \left(\frac{2x^2 + 3}{2x^2 - 5}\right)^{x^2}.$$
:::

::: solution
При $x \to \infty$ основание стремится к $1$, показатель — к $+\infty$ (неопределённость $1^\infty$). Выделим единицу:
$$\frac{2x^2 + 3}{2x^2 - 5} = 1 + \frac{8}{2x^2 - 5}.$$
При достаточно больших $|x|$ основание положительно, поэтому $\left(\frac{2x^2 + 3}{2x^2 - 5}\right)^{x^2} = \exp\bigl(x^2 \ln(1 + \frac{8}{2x^2 - 5})\bigr)$. Так как $\alpha(x) = \frac{8}{2x^2 - 5} \to 0$ и $\alpha(x) \ne 0$, имеем $\ln(1 + \alpha(x)) \sim \alpha(x)$ (утверждение [-@prop:lec09:substitution]). Предел показателя:
$$\lim_{x \to \infty} x^2 \ln\!\left(1 + \frac{8}{2x^2 - 5}\right) = \lim_{x \to \infty} \frac{8x^2}{2x^2 - 5} = \lim_{x \to \infty} \frac{8}{2 - 5/x^2} = 4.$$
По непрерывности $e^y$ (теорема [-@thm:lec11:exp]) исходный предел равен $e^4$.

*Ответ:* $e^4$.
:::

::: {.problem #prob:quiz-limits:power-trig}
Вычислите предел
$$\lim_{x \to 0} \bigl(1 + \sin^2 3x\bigr)^{\frac{1}{\ln\cos 2x}}.$$
:::

::: solution
При $x \to 0$ основание $1 + \sin^2 3x \to 1$, знаменатель показателя $\ln\cos 2x \to 0$ (неопределённость $1^\infty$). Переходим к экспоненте: $\exp\bigl(\frac{\ln(1 + \sin^2 3x)}{\ln\cos 2x}\bigr)$.

*Ключ:* заменить и числитель, и знаменатель показателя на эквивалентные при $x \to 0$:

- $\sin^2 3x \sim 9x^2 \to 0$, откуда $\ln(1 + \sin^2 3x) \sim \sin^2 3x \sim 9x^2$;
- $\cos 2x = 1 - (1 - \cos 2x)$, где $1 - \cos 2x \sim \frac{(2x)^2}{2} = 2x^2 \to 0$, поэтому $\ln\cos 2x = \ln\bigl(1 - (1 - \cos 2x)\bigr) \sim -(1 - \cos 2x) \sim -2x^2$.

Оба выражения отличны от нуля в проколотой окрестности нуля. По теореме [-@thm:lec09:replacement] предел показателя равен
$$\lim_{x \to 0} \frac{\ln(1 + \sin^2 3x)}{\ln\cos 2x} = \lim_{x \to 0} \frac{9x^2}{-2x^2} = -\frac92.$$
По непрерывности экспоненты (теорема [-@thm:lec11:exp]) исходный предел равен $e^{-9/2}$.

*Ответ:* $e^{-9/2}$.
:::

Ещё задачи: [-@prob:lec09:one-inf-o], [-@prob:lec08:e-limits], [-@prob:lec11:limits].
