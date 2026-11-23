---
course: algebra
title: "Подготовка к экзамену 1: алгебра"
date: 2026-12-21
active_until: 2026-12-30
---

# Об экзамене

Экзамен первого семестра проходит в сессию 21–30 декабря. Работа письменная, длится 120 минут. Вес экзамена — $0{,}45$ оценки за первый семестр (не блокирующий элемент). У каждого пункта указана его стоимость; за частично выполненный пункт ставится часть баллов по доле выполненного, а сумма переводится в десятибалльную шкалу с округлением до целого (не выше 10).

Экзамен проверяет системы линейных уравнений (совместность, фундаментальную систему решений, общее решение однородной и неоднородной систем), комплексные числа и многочлены, векторную алгебру и аналитическую геометрию (плоскости и прямые в пространстве), а также полугруппы, моноиды и группы.

# Билеты

## 1. Теорема Кронекера–Капелли {#sec:exam1:kronecker-capelli}

::: {.definition ref="def:lec08:consistency"}
СЛАУ *совместна*, если у неё есть хотя бы одно решение, и *несовместна*, если решений нет; совместная система *определена* (решение единственно) или *неопределена* (решений больше одного).
:::

::: {.theorem ref="thm:lec08:kronecker-capelli"}
Система линейных уравнений $Ax = b$ совместна тогда и только тогда, когда $\operatorname{Rg} A = \operatorname{Rg}(A \mid b)$.
:::

::: {.remark #rem:exam1:proof-kronecker-capelli title="доказательство"}
Пусть $A_1, \dots, A_n$ — столбцы матрицы $A$, $r = \operatorname{Rg} A$.

*Необходимость.* Пусть $x = (x_1, \dots, x_n)^T$ — решение $Ax = b$, то есть $b = x_1 A_1 + \dots + x_n A_n$. Если $r = 0$, то $A = O$, $b = 0$ и $\operatorname{Rg}(A \mid b) = 0$. Если $r \ge 1$, зафиксируем базисный минор $M$ матрицы $A$ порядка $r$ (для удобства — в левом верхнем углу). По п. 2 теоремы о базисном миноре [-@thm:lec07:basis-minor] каждый небазисный столбец $A$ — линейная комбинация базисных, поэтому и $b$ — линейная комбинация базисных столбцов $A_1, \dots, A_r$. Значит, в любом миноре матрицы $(A \mid b)$ порядка $r + 1$, окаймляющем $M$, либо последний столбец — из $A$ (и минор равен $0$, так как $\operatorname{Rg} A = r$), либо последний столбец — это $b$, который является линейной комбинацией первых $r$ столбцов, и минор равен $0$ (утверждение [-@prop:lec04:comb-zero]). По теореме об окаймляющих минорах [-@thm:lec08:bordering] $\operatorname{Rg}(A \mid b) = r$.

*Достаточность.* Пусть $\operatorname{Rg}(A \mid b) = \operatorname{Rg} A = r$. При $r = 0$ имеем $A = O$, $b = 0$, и подходит $x = 0$. При $r \ge 1$ базисный минор $M$ матрицы $A$ (в столбцах $A_1, \dots, A_r$) ненулевой и имеет порядок $r = \operatorname{Rg}(A \mid b)$, значит, он базисный и в $(A \mid b)$. По п. 2 теоремы [-@thm:lec07:basis-minor] столбец $b$ выражается через базисные столбцы: $b = \lambda_1 A_1 + \dots + \lambda_r A_r$. Тогда $x = (\lambda_1, \dots, \lambda_r, 0, \dots, 0)^T$ — решение $Ax = b$.
:::

## 2. Существование фундаментальной системы решений {#sec:exam1:fsr-existence}

::: {.definition ref="def:lec09:fsr"}
*Фундаментальной системой решений (ФСР)* однородной системы $Ax = 0$ с $r = \operatorname{Rg} A < n$ ($n$ — число неизвестных) называются любые $n - r$ линейно независимых решений.
:::

::: {.definition ref="def:lec09:normal-fsr"}
*Нормальной ФСР* называется ФСР, в которой у $j$-го решения $j$-я свободная переменная равна $1$, а остальные свободные переменные равны $0$.
:::

::: {.theorem ref="thm:lec09:fsr-existence"}
Если $\operatorname{Rg} A = r < n$, то однородная система $Ax = 0$ имеет фундаментальную систему решений (в частности, нормальную ФСР).
:::

::: {.remark #rem:exam1:proof-fsr-existence title="доказательство"}
*Шаг 1: случай $r = 0$.* Тогда $A = O$, все $n$ столбцов единичной матрицы $E_n$ — решения, и они линейно независимы ($\det E_n = 1 \ne 0$, теорема [-@thm:lec08:nondegenerate]).

*Шаг 2: приведение к базисным уравнениям ($1 \le r < n$).* Зафиксируем базисный минор $M$ порядка $r$ и перестановкой уравнений и неизвестных перенесём его в левый верхний угол (множество решений при этом лишь перенумеруется). По п. 2 теоремы о базисном миноре [-@thm:lec07:basis-minor] строки $r + 1, \dots, m$ — линейные комбинации первых $r$ строк, поэтому элементарными преобразованиями третьего типа их можно обнулить, не меняя множества решений. Остаётся равносильная система из $r$ уравнений с главными переменными $x_1, \dots, x_r$ слева и свободными $x_{r+1}, \dots, x_n$ справа: матрица $B$ при главных переменных имеет $\det B = M \ne 0$.

*Шаг 3: построение нормальной ФСР.* При любых заданных значениях свободных переменных главные определяются однозначно (утверждение [-@prop:lec06:unique-solution]). Положим $k = n - r$ и для каждого $j = 1, \dots, k$ дадим свободным переменным набор «$j$-я равна $1$, остальные $0$»; найдём главные — получим $k$ решений $\Phi_1, \dots, \Phi_k$.

*Шаг 4: линейная независимость.* Составим матрицу $\Phi = (\Phi_1 \; \dots \; \Phi_k)$ размера $n \times k$. В её нижних $k$ строках (строках свободных переменных) стоит единичная матрица $E_k$ с $\det E_k = 1 \ne 0$. Значит, $\operatorname{Rg} \Phi = k$, и по теореме о базисном миноре [-@thm:lec07:basis-minor] все $k$ столбцов $\Phi_1, \dots, \Phi_k$ линейно независимы.
:::

## 3. Критерий существования ненулевого решения однородной квадратной СЛАУ {#sec:exam1:nonzero-solution}

Определения ФСР и теорема о её существовании — [-@def:lec09:fsr], [-@thm:lec09:fsr-existence].

::: {.corollary ref="cor:lec09:nonzero-solution"}
Однородная система $Ax = 0$ с квадратной матрицей $A \in M_n(\R)$ имеет ненулевое решение тогда и только тогда, когда $\det A = 0$.
:::

::: {.remark #rem:exam1:proof-nonzero-solution title="доказательство"}
*Необходимость (от противного).* Пусть $\det A \ne 0$. По правилу Крамера (утверждение [-@prop:lec06:unique-solution], следствие [-@cor:lec06:homogeneous]) система $Ax = 0$ имеет единственное решение — нулевое $x = 0$. Значит, если ненулевое решение существует, то $\det A = 0$.

*Достаточность.* Пусть $\det A = 0$. Так как единственный минор порядка $n$ равен нулю, имеем $r = \operatorname{Rg} A < n$. Тогда $n - r \ge 1$, и по теореме о существовании ФСР [-@thm:lec09:fsr-existence] существует ФСР $\Phi_1, \dots, \Phi_{n-r}$. Ни один столбец линейно независимого набора не может быть нулевым (замечание [-@rem:lec07:dependence-corner]), поэтому $\Phi_1 \ne 0$ — ненулевое решение $Ax = 0$.
:::

## 4. Структура общего решения однородной СЛАУ {#sec:exam1:homogeneous}

Определения ФСР — [-@def:lec09:fsr].

::: {.theorem ref="thm:lec10:homogeneous"}
Пусть $A \in M_{m \times n}(\R)$, $r = \operatorname{Rg} A < n$, и $\Phi_1, \dots, \Phi_k$ ($k = n - r$) — ФСР системы $Ax = 0$. Тогда любое решение $x$ представляется в виде $x = c_1 \Phi_1 + \dots + c_k \Phi_k$ с некоторыми $c_1, \dots, c_k \in \R$, и обратно, любая такая линейная комбинация — решение.
:::

::: {.definition ref="def:lec10:general-homogeneous"}
Запись $x = c_1 \Phi_1 + \dots + c_k \Phi_k$ ($c_1, \dots, c_k \in \R$) называется *общим решением* однородной системы $Ax = 0$.
:::

::: {.remark #rem:exam1:proof-homogeneous title="доказательство"}
*Обратно:* любая линейная комбинация решений однородной системы — её решение (свойство 1, утверждение [-@prop:lec08:solution-properties]).

*Прямо.* Пусть $x$ — произвольное решение $Ax = 0$. Составим матрицу $D = (x \; \Phi_1 \; \dots \; \Phi_k)$ размера $n \times (k + 1)$ со строками $D_1, \dots, D_n$. Докажем, что $\operatorname{Rg} D = k$.

*Шаг 1: приведённая СЛАУ (при $r \ge 1$).* Перенесём базисный минор $M$ матрицы $A$ в левый верхний угол (перестановка строк матрицы $D$ не меняет её ранг, теорема [-@thm:lec07:elementary]). Как в теореме [-@thm:lec09:fsr-existence], система равносильна $B(x_1, \dots, x_r)^T = -C(x_{r+1}, \dots, x_n)^T$ с невырожденной $B$. Умножая слева на $B^{-1}$, выражаем главные переменные через свободные с общими для всех решений коэффициентами: $x_i = \sum_{j=r+1}^{n} \alpha_{ij} x_j$ ($i = 1, \dots, r$).

*Шаг 2: $\operatorname{Rg} D = k$.* Столбцы $\Phi_1, \dots, \Phi_k$ линейно независимы, поэтому по теореме о ранге [-@thm:lec08:rank] $\operatorname{Rg} D \ge k$. Для оценки сверху: если $r = 0$, то $k = n$ и у $D$ всего $n = k$ строк, откуда сразу $\operatorname{Rg} D \le k$. Если $r \ge 1$, то все столбцы $D$ удовлетворяют приведённой системе, значит, $D_i = \sum_{j=r+1}^{n} \alpha_{ij} D_j$ для каждого $i \le r$. Вычтем эти комбинации из первых $r$ строк (преобразования третьего типа не меняют ранг): первые $r$ строк обнулятся, останется не больше $n - r = k$ ненулевых строк, поэтому все миноры порядка выше $k$ равны $0$ (утверждение [-@prop:lec04:zero]) и $\operatorname{Rg} D \le k$. Итого $\operatorname{Rg} D = k$.

*Шаг 3.* Матрица $(\Phi_1 \; \dots \; \Phi_k)$ имеет ранг $k$, то есть ненулевой минор порядка $k$. Он базисный в $D$, а $\Phi_1, \dots, \Phi_k$ — базисные столбцы $D$. По п. 2 теоремы о базисном миноре [-@thm:lec07:basis-minor] столбец $x$ — их линейная комбинация: $x = c_1 \Phi_1 + \dots + c_k \Phi_k$.
:::

## 5. Структура общего решения неоднородной СЛАУ {#sec:exam1:nonhomogeneous}

Теорема о структуре общего решения однородной СЛАУ — [-@thm:lec10:homogeneous].

::: {.theorem ref="thm:lec10:nonhomogeneous"}
Пусть система $Ax = b$ совместна и $\tilde x$ — какое-нибудь её частное решение. Если $r = \operatorname{Rg} A < n$ и $\Phi_1, \dots, \Phi_k$ ($k = n - r$) — ФСР соответствующей однородной системы $Ax = 0$, то любое решение $Ax = b$ имеет вид $x = \tilde x + c_1 \Phi_1 + \dots + c_k \Phi_k$ ($c_1, \dots, c_k \in \R$), и обратно, любой такой столбец — решение $Ax = b$. Если $r = n$, решение единственно: $x = \tilde x$.
:::

::: {.definition ref="def:lec10:general-nonhomogeneous"}
Запись $x = \tilde x + c_1 \Phi_1 + \dots + c_k \Phi_k$ ($c_1, \dots, c_k \in \R$) называется *общим решением* неоднородной системы $Ax = b$.
:::

::: {.remark #rem:exam1:proof-nonhomogeneous title="доказательство"}
*Прямо.* Пусть $x$ — любое решение $Ax = b$. Так как $A\tilde x = b$, по дистрибутивности умножения матриц $A(x - \tilde x) = Ax - A\tilde x = b - b = 0$, то есть столбец $y = x - \tilde x$ — решение однородной системы $Ax = 0$ (свойство 3, утверждение [-@prop:lec08:solution-properties]). Если $r < n$, то по теореме [-@thm:lec10:homogeneous] найдутся $c_1, \dots, c_k \in \R$ с $x - \tilde x = c_1 \Phi_1 + \dots + c_k \Phi_k$, откуда $x = \tilde x + c_1 \Phi_1 + \dots + c_k \Phi_k$. Если $r = n$, то у $Ax = 0$ только нулевое решение (свободных переменных нет), значит, $x - \tilde x = 0$ и $x = \tilde x$.

*Обратно.* При любых $c_1, \dots, c_k \in \R$ столбец $y = c_1 \Phi_1 + \dots + c_k \Phi_k$ — решение $Ax = 0$ (свойство 1). Тогда $A(\tilde x + y) = A\tilde x + Ay = b + 0 = b$ (свойство 2), то есть $\tilde x + y$ — решение $Ax = b$.
:::

::: {.remark #rem:exam1:c0-pitfall tag="подводный камень"}
Перед частным решением $\tilde x$ коэффициент не ставится: $A(c_0 \tilde x + \sum c_j \Phi_j) = c_0 b \ne b$ при $c_0 \ne 1$ (замечание [-@rem:lec10:c0-trap]).
:::

## 6. Умножение и деление комплексных чисел в тригонометрической форме {#sec:exam1:trig-mult}

::: {.definition ref="def:lec11:modulus"}
*Модуль* числа $z = x + iy$: $|z| = \sqrt{x^2 + y^2} = \sqrt{z \bar z}$.
:::

::: {.definition ref="def:lec11:argument"}
*Аргумент* $z \ne 0$: любой угол $\varphi$ с $\cos \varphi = \frac{x}{|z|}$, $\sin \varphi = \frac{y}{|z|}$ (определён с точностью до $2\pi k$, $k \in \Z$). Множество всех аргументов — $\operatorname{Arg} z$; *главное значение* $\arg z \in (-\pi, \pi]$ (также выбирают $[0, 2\pi)$, замечание [-@rem:lec11:arg-convention]). У нуля аргумента нет.
:::

::: {.definition ref="def:lec11:trig-form"}
*Тригонометрическая форма* $z \ne 0$: $z = r(\cos \varphi + i \sin \varphi)$, где $r = |z| > 0$, $\varphi \in \operatorname{Arg} z$.
:::

::: {.theorem ref="thm:lec11:trig-mult"}
Для $z_1 = r_1(\cos \varphi_1 + i \sin \varphi_1)$ и $z_2 = r_2(\cos \varphi_2 + i \sin \varphi_2)$:
$$z_1 z_2 = r_1 r_2\big(\cos(\varphi_1 + \varphi_2) + i \sin(\varphi_1 + \varphi_2)\big), \qquad \frac{z_1}{z_2} = \frac{r_1}{r_2}\big(\cos(\varphi_1 - \varphi_2) + i \sin(\varphi_1 - \varphi_2)\big).$$
:::

::: {.remark #rem:exam1:proof-trig-mult title="доказательство"}
*Умножение.* Раскроем скобки по свойствам поля $\mathbb{C}$ (утверждение [-@prop:lec11:field]) с учётом $i^2 = -1$ и применим формулы косинуса и синуса суммы:
$$\begin{aligned} z_1 z_2 &= r_1 r_2\big((\cos \varphi_1 \cos \varphi_2 - \sin \varphi_1 \sin \varphi_2) + i(\cos \varphi_1 \sin \varphi_2 + \sin \varphi_1 \cos \varphi_2)\big) \\ &= r_1 r_2\big(\cos(\varphi_1 + \varphi_2) + i \sin(\varphi_1 + \varphi_2)\big). \end{aligned}$$
Так как $r_1 r_2 > 0$, это тригонометрическая форма $z_1 z_2$: модули перемножаются, аргументы складываются.

*Деление.* Обозначим через $w$ правую часть формулы частного. Так как $r_2 > 0$, имеем $\frac{r_1}{r_2} > 0$, и по уже доказанному правилу умножения
$$z_2 w = r_2 \cdot \frac{r_1}{r_2}\big(\cos(\varphi_2 + \varphi_1 - \varphi_2) + i \sin(\varphi_2 + \varphi_1 - \varphi_2)\big) = r_1(\cos \varphi_1 + i \sin \varphi_1) = z_1.$$
Умножив обе части на $z_2^{-1}$ (существует, так как $z_2 \ne 0$, утверждение [-@prop:lec11:complex-division]), получаем $w = z_1 z_2^{-1} = \frac{z_1}{z_2}$.
:::

## 7. Формула Муавра {#sec:exam1:moivre}

Определение тригонометрической формы и правило умножения — [-@def:lec11:trig-form], [-@thm:lec11:trig-mult].

::: {.theorem ref="thm:lec11:moivre"}
Если $z = r(\cos \varphi + i \sin \varphi)$, то для любого $n \in \N$ (а при $z \ne 0$ — для любого $n \in \Z$)
$$z^n = r^n(\cos n\varphi + i \sin n\varphi).$$
:::

::: {.remark #rem:exam1:proof-moivre title="доказательство"}
*Шаг 1: $n \in \N$ (индукция по $n$).* База $n = 1$: $z^1 = r^1(\cos \varphi + i \sin \varphi)$ — верное равенство. Переход: пусть $z^k = r^k(\cos k\varphi + i \sin k\varphi)$ верно для некоторого $k \in \N$. По теореме об умножении в тригонометрической форме [-@thm:lec11:trig-mult]
$$z^{k+1} = z^k \cdot z = r^k \cdot r\big(\cos(k\varphi + \varphi) + i \sin(k\varphi + \varphi)\big) = r^{k+1}\big(\cos(k + 1)\varphi + i \sin(k + 1)\varphi\big).$$
По принципу математической индукции формула верна для всех $n \in \N$.

*Шаг 2: $n \le 0$ при $z \ne 0$.* При $n = 0$: $z^0 = 1 = r^0(\cos 0 + i \sin 0)$. При $n = -m$ ($m \in \N$): по правилу деления [-@thm:lec11:trig-mult] для $1 = 1(\cos 0 + i \sin 0)$ получаем $z^{-1} = \frac1r(\cos(-\varphi) + i \sin(-\varphi))$. Применяя шаг 1 к $z^{-1}$ в степени $m$, имеем
$$z^{-m} = (z^{-1})^m = r^{-m}\big(\cos(-m\varphi) + i \sin(-m\varphi)\big).$$
:::

## 8. Формула комплексных корней $n$-й степени {#sec:exam1:roots}

::: {.definition ref="def:lec11:root"}
*Корнем $n$-й степени* из $w \in \mathbb{C}$ ($n \in \N$) называется любое $z \in \mathbb{C}$ с $z^n = w$; множество всех таких $z$ обозначается $\sqrt[n]{w}$.
:::

::: {.theorem ref="thm:lec11:roots"}
Пусть $w = \rho(\cos \psi + i \sin \psi) \ne 0$ и $n \in \N$. Тогда у $w$ ровно $n$ различных корней $n$-й степени:
$$z_k = \sqrt[n]{\rho}\left(\cos \frac{\psi + 2\pi k}{n} + i \sin \frac{\psi + 2\pi k}{n}\right), \qquad k = 0, 1, \dots, n - 1,$$
где $\sqrt[n]{\rho} > 0$ — арифметический корень. Геометрически при $n \ge 3$ они образуют вершины правильного $n$-угольника на окружности радиуса $\sqrt[n]{\rho}$ с центром в нуле (при $n = 2$ — две противоположные точки).
:::

::: {.remark #rem:exam1:proof-roots title="доказательство"}
*Шаг 1: нахождение всех корней.* Так как $w \ne 0$, корень $z$ не равен $0$ (иначе $0^n = 0 \ne w$). Запишем его в тригонометрической форме: $z = r(\cos \varphi + i \sin \varphi)$, $r > 0$. По формуле Муавра [-@thm:lec11:moivre] $z^n = r^n(\cos n\varphi + i \sin n\varphi)$. Два числа в тригонометрической форме равны тогда и только тогда, когда равны их модули, а аргументы отличаются на $2\pi k$, $k \in \Z$ (формула [-@eq:lec11:trig-equal]). Значит, $z^n = w$ равносильно системе
$$r^n = \rho, \qquad n\varphi = \psi + 2\pi k \quad (k \in \Z).$$
Положительное вещественное $r$ с $r^n = \rho$ единственно: $r = \sqrt[n]{\rho}$; угол $\varphi = \frac{\psi + 2\pi k}{n}$. Итак, множество всех корней состоит из чисел $z_k$ при $k \in \Z$.

*Шаг 2: ровно $n$ различных корней.* По [-@eq:lec11:trig-equal] $z_k = z_m$ тогда и только тогда, когда разность их аргументов $\frac{\psi + 2\pi k}{n} - \frac{\psi + 2\pi m}{n} = \frac{2\pi(k - m)}{n}$ кратна $2\pi$, то есть $n \mid (k - m)$. Разделив произвольное $k \in \Z$ на $n$ с остатком $k = nq + s$ ($0 \le s \le n - 1$), видим $z_k = z_s$, поэтому все корни встречаются среди $z_0, \dots, z_{n-1}$. А для любых $0 \le m < k \le n - 1$ имеем $1 \le k - m \le n - 1$, так что $n \nmid (k - m)$ и $z_k \ne z_m$.

*Шаг 3: геометрия.* Все $z_k$ имеют одинаковый модуль $\sqrt[n]{\rho}$, а аргумент каждого следующего больше на $\frac{2\pi}{n}$, поэтому при $n \ge 3$ это вершины правильного $n$-угольника (рис. [-@fig:lec11:roots], [-@fig:lec11:roots-arg]).
:::

## 9. Теорема Безу и разложение многочлена над $\mathbb{C}$ {#sec:exam1:bezout}

Основная теорема алгебры — [-@thm:lec11:fta].

::: {.proposition ref="prop:lec12:division"}
Для любых многочленов $f$ и $g \ne 0$ существуют единственные $q$, $r$ с $f = gq + r$, где $r = 0$ или $\deg r < \deg g$ (для вещественных $f, g$ они вещественны).
:::

::: {.theorem ref="thm:lec12:bezout"}
Остаток от деления многочлена $f(z)$ на $z - c$ равен $f(c)$.
:::

::: {.corollary ref="cor:lec12:root-factor"}
Число $c$ — корень многочлена $f(z)$ тогда и только тогда, когда $f(z)$ делится на $z - c$ без остатка.
:::

::: {.corollary ref="cor:lec12:linear-factors"}
Всякий многочлен степени $n \ge 1$ над $\mathbb{C}$ раскладывается в произведение линейных множителей $f(z) = a_n(z - z_1)^{\alpha_1} \cdots (z - z_s)^{\alpha_s}$, где $\alpha_1 + \dots + \alpha_s = n$.
:::

::: {.remark #rem:exam1:proof-bezout title="доказательство"}
*Теорема Безу и следствие о корне.* По утверждению о делении с остатком [-@prop:lec12:division] запишем $f(z) = (z - c)q(z) + r$, где $r = 0$ или $\deg r < \deg(z - c) = 1$, то есть $r$ — константа. Подставим $z = c$: $f(c) = (c - c)q(c) + r = r$. Значит, $r = 0 \Leftrightarrow f(c) = 0$.

*Разложение над $\mathbb{C}$ (индукция по $n = \deg f$).* При $n = 1$: $f(z) = a_1 z + a_0 = a_1(z - (-a_0 / a_1))$. Переход: пусть утверждение верно для степени $n - 1$, и $\deg f = n \ge 2$. По основной теореме алгебры [-@thm:lec11:fta] у $f$ есть корень $c_1 \in \mathbb{C}$. По следствию из теоремы Безу $f(z) = (z - c_1)q(z)$, где $\deg q = n - 1$, а старший коэффициент $q$ равен $a_n$. Применив предположение индукции к $q$ и сгруппировав одинаковые множители, получаем требуемое разложение.
:::

## 10. Сопряжённые корни и разложение вещественного многочлена над $\R$ {#sec:exam1:real-poly}

::: {.proposition ref="prop:lec12:conjugate-root"}
Если $z_0 \in \mathbb{C}$ — корень многочлена $f$ с вещественными коэффициентами, то $\bar z_0$ — тоже его корень.
:::

::: {.definition ref="def:lec12:irreducible"}
Многочлен $f$ степени $\ge 1$ над полем $K \in \{\Q, \R, \mathbb{C}\}$ *приводим* над $K$, если $f = gh$ с многочленами $g, h$ над $K$ меньшей степени; иначе *неприводим*.
:::

::: {.proposition ref="prop:lec12:irreducible-list"}
Над $\mathbb{C}$ неприводимы ровно многочлены степени $1$; над $\R$ — степени $1$ и степени $2$ с отрицательным дискриминантом.
:::

::: {.theorem ref="thm:lec12:real-factorization"}
Всякий многочлен степени $n \ge 1$ с вещественными коэффициентами раскладывается над $\R$ в произведение $a_n \prod (x - c_i)^{k_i} \prod (x^2 + p_j x + q_j)^{l_j}$ ($p_j^2 - 4q_j < 0$, $\sum k_i + 2\sum l_j = n$).
:::

::: {.remark #rem:exam1:proof-real-poly title="доказательство"}
*Шаг 1: сопряжённый корень.* Пусть $f(x) = \sum_{k=0}^{n} a_k x^k$, $a_k \in \R$, и $f(z_0) = 0$. Сопряжём обе части, пользуясь свойствами сопряжения [-@prop:lec11:conjugate] ($\overline{u + v} = \bar u + \bar v$, $\overline{uv} = \bar u \bar v$, $\bar a_k = a_k$):
$$0 = \overline{f(z_0)} = \sum_{k=0}^{n} \bar a_k (\bar z_0)^k = \sum_{k=0}^{n} a_k (\bar z_0)^k = f(\bar z_0).$$

*Шаг 2: список неприводимых над $\R$ и разложение.* Многочлены степени $1$ неприводимы всегда; квадратный трёхчлен с $D < 0$ не имеет вещественных корней, значит, не имеет линейных множителей над $\R$ и неприводим. Пусть $\deg f \ge 2$; по основной теореме алгебры [-@thm:lec11:fta] у $f$ есть комплексный корень $z_0 \in \mathbb{C}$. Если $z_0 \in \R$, то по следствию из теоремы Безу $f(x) = (x - z_0)q(x)$ с вещественным $q$ (по единственности деления [-@prop:lec12:division]). Если $z_0 \notin \R$, то $\bar z_0 \ne z_0$ — тоже корень (шаг 1): запишем $f(x) = (x - z_0)q_1(x)$, подставим $\bar z_0$ и получим $0 = (\bar z_0 - z_0)q_1(\bar z_0)$, откуда $q_1(\bar z_0) = 0$ и $q_1(x) = (x - \bar z_0)q_2(x)$. Значит, $f$ делится над $\mathbb{C}$ на произведение
$$(x - z_0)(x - \bar z_0) = x^2 - (2\operatorname{Re} z_0)x + |z_0|^2.$$
У этого квадратного трёхчлена вещественные коэффициенты и $D = 4(\operatorname{Re} z_0)^2 - 4|z_0|^2 = -4(\operatorname{Im} z_0)^2 < 0$. По единственности деления частное $q_2$ вещественно, поэтому при $\deg f \ge 3$ многочлен $f$ приводим. Разложение на неприводимые над $\R$ следует сильной индукцией по степени $n = \deg f$ (база: $n = 1$ и $n = 2$ с $D < 0$; отщепление линейного или квадратного множителя снижает степень на $1$ или на $2$).
:::

## 11. Скалярное произведение в произвольном базисе {#sec:exam1:dot-coords}

::: {.definition ref="def:lec12:dot"}
*Скалярное произведение* $(\vec a, \vec b) = |\vec a|\,|\vec b|\cos \angle(\vec a, \vec b)$ (при $\vec a = \vec 0$ или $\vec b = \vec 0$ равно $0$).
:::

::: {.definition ref="def:lec12:gram"}
*Матрица Грама* базиса $\vec e_1, \vec e_2, \vec e_3$ — квадратная матрица $\Gamma$ порядка $3$ с элементами $[\Gamma]_{ij} = (\vec e_i, \vec e_j)$.
:::

::: {.theorem ref="thm:lec12:dot-coordinates"}
Если $x = (x_1, x_2, x_3)^T$ и $y = (y_1, y_2, y_3)^T$ — столбцы координат векторов $\vec x, \vec y$ в произвольном базисе $\vec e_1, \vec e_2, \vec e_3$ с матрицей Грама $\Gamma$, то
$$(\vec x, \vec y) = \sum_{i=1}^{3} \sum_{j=1}^{3} (\vec e_i, \vec e_j)\, x_i y_j = x^T \Gamma y.$$
:::

::: {.remark #rem:exam1:proof-dot-coords title="доказательство"}
*Шаг 1: разложение по базису.* По определению координат (теорема [-@thm:lec12:coordinates]) $\vec x = \sum_{i=1}^{3} x_i \vec e_i$ и $\vec y = \sum_{j=1}^{3} y_j \vec e_j$.

*Шаг 2: линейность скалярного произведения.* Применяя линейность скалярного произведения по первому, затем по второму аргументу (утверждение [-@prop:lec12:dot-props]), получаем
$$(\vec x, \vec y) = \left(\sum_{i=1}^{3} x_i \vec e_i, \; \sum_{j=1}^{3} y_j \vec e_j\right) = \sum_{i=1}^{3} x_i \left(\vec e_i, \; \sum_{j=1}^{3} y_j \vec e_j\right) = \sum_{i=1}^{3} \sum_{j=1}^{3} x_i (\vec e_i, \vec e_j) y_j.$$

*Шаг 3: матричная запись.* Подставляя $[\Gamma]_{ij} = (\vec e_i, \vec e_j)$, замечаем, что $[\Gamma y]_i = \sum_{j=1}^{3} [\Gamma]_{ij} y_j$, а затем $[x^T (\Gamma y)]_{11} = \sum_{i=1}^{3} x_i [\Gamma y]_i = \sum_{i=1}^{3} \sum_{j=1}^{3} x_i [\Gamma]_{ij} y_j$. В ОНБ $\Gamma = E$ и формула сводится к $x_1 y_1 + x_2 y_2 + x_3 y_3$ (следствие [-@cor:lec12:onb]).
:::

## 12. Векторное произведение в правом ортонормированном базисе {#sec:exam1:cross-coords}

::: {.definition ref="def:lec13:cross"}
*Векторное произведение* $[\vec a, \vec b]$ — вектор длины $|\vec a|\,|\vec b|\sin \varphi$, перпендикулярный $\vec a$ и $\vec b$, такой, что тройка $\vec a, \vec b, [\vec a, \vec b]$ правая (при $[\vec a, \vec b] \ne \vec 0$).
:::

::: {.theorem ref="thm:lec13:cross-props"}
Три алгебраических свойства векторного произведения: (1) антикоммутативность $[\vec b, \vec a] = -[\vec a, \vec b]$; (2) однородность $[\lambda \vec a, \vec b] = \lambda [\vec a, \vec b]$; (3) дистрибутивность $[\vec a_1 + \vec a_2, \vec b] = [\vec a_1, \vec b] + [\vec a_2, \vec b]$ (аналогично по второму аргументу).
:::

::: {.theorem ref="thm:lec13:cross-coords"}
В правом ортонормированном базисе $\vec i, \vec j, \vec k$ для $\vec a = (a_1, a_2, a_3)$ и $\vec b = (b_1, b_2, b_3)$:
$$[\vec a, \vec b] = (a_2 b_3 - a_3 b_2, \; a_3 b_1 - a_1 b_3, \; a_1 b_2 - a_2 b_1) = \begin{vmatrix} \vec i & \vec j & \vec k \\ a_1 & a_2 & a_3 \\ b_1 & b_2 & b_3 \end{vmatrix}.$$
:::

::: {.remark #rem:exam1:proof-cross-coords title="доказательство"}
*Шаг 1: произведения базисных векторов.* В правом ОНБ $\vec i, \vec j, \vec k$ векторы единичны и попарно перпендикулярны. Для $[\vec i, \vec j]$: длина $1 \cdot 1 \cdot \sin \frac{\pi}{2} = 1$, вектор перпендикулярен $\vec i$ и $\vec j$ (значит, равен $\pm \vec k$), а так как тройка $\vec i, \vec j, \vec k$ правая, выбираем знак «$+$»: $[\vec i, \vec j] = \vec k$. Циклические перестановки $\vec j, \vec k, \vec i$ и $\vec k, \vec i, \vec j$ тоже правые, поэтому $[\vec j, \vec k] = \vec i$ и $[\vec k, \vec i] = \vec j$. По антикоммутативности $[\vec j, \vec i] = -\vec k$, $[\vec k, \vec j] = -\vec i$, $[\vec i, \vec k] = -\vec j$; кроме того, $[\vec i, \vec i] = [\vec j, \vec j] = [\vec k, \vec k] = \vec 0$.

*Шаг 2: раскрытие по линейности.* Подставим $\vec a = a_1 \vec i + a_2 \vec j + a_3 \vec k$ и $\vec b = b_1 \vec i + b_2 \vec j + b_3 \vec k$ и раскроем скобки по линейности (теорема [-@thm:lec13:cross-props]):
$$\begin{aligned} [\vec a, \vec b] &= a_1 b_2 [\vec i, \vec j] + a_1 b_3 [\vec i, \vec k] + a_2 b_1 [\vec j, \vec i] + a_2 b_3 [\vec j, \vec k] + a_3 b_1 [\vec k, \vec i] + a_3 b_2 [\vec k, \vec j] \\ &= (a_2 b_3 - a_3 b_2)\vec i + (a_3 b_1 - a_1 b_3)\vec j + (a_1 b_2 - a_2 b_1)\vec k. \end{aligned}$$
Это в точности разложение формального определителя по первой строке.
:::

::: {.remark #rem:exam1:left-onb-pitfall tag="подводный камень"}
Формула верна только в *правом* ОНБ: в левом ОНБ $[\vec i, \vec j] = -\vec k$, и перед определителем появляется минус (замечание [-@rem:lec13:right-onb-only]).
:::

## 13. Смешанное произведение и объём параллелепипеда {#sec:exam1:volume}

::: {.definition ref="def:lec13:mixed"}
*Смешанное произведение* упорядоченной тройки векторов: $\langle \vec a, \vec b, \vec c \rangle = ([\vec a, \vec b], \vec c)$.
:::

::: {.theorem ref="thm:lec13:volume"}
Если $\vec a, \vec b, \vec c$ компланарны, то $\langle \vec a, \vec b, \vec c \rangle = 0$. Иначе $|\langle \vec a, \vec b, \vec c \rangle| = V$ — объём параллелепипеда на $\vec a, \vec b, \vec c$, причём $\langle \vec a, \vec b, \vec c \rangle = +V$ для правой тройки и $-V$ для левой.
:::

::: {.corollary ref="cor:lec13:coplanar"}
(1) $\vec a, \vec b, \vec c$ компланарны $\Leftrightarrow \langle \vec a, \vec b, \vec c \rangle = 0$; (2) некомпланарная тройка правая $\Leftrightarrow \langle \vec a, \vec b, \vec c \rangle > 0$; (3) объём тетраэдра на $\vec a, \vec b, \vec c$ равен $\frac16 |\langle \vec a, \vec b, \vec c \rangle|$.
:::

::: {.remark #rem:exam1:proof-volume title="доказательство"}
*Случай 1: векторы компланарны.* Если $\vec a, \vec b$ коллинеарны, то $[\vec a, \vec b] = \vec 0$ (утверждение [-@prop:lec13:collinear]) и $\langle \vec a, \vec b, \vec c \rangle = 0$. Если $\vec a, \vec b$ неколлинеарны, то вектор $\vec n = [\vec a, \vec b]$ перпендикулярен их плоскости; так как $\vec c$ параллелен той же плоскости, $\vec c \perp \vec n$ и $(\vec n, \vec c) = 0$.

*Случай 2: векторы некомпланарны.* Тогда $\vec a, \vec b$ неколлинеарны, $\vec n = [\vec a, \vec b] \ne \vec 0$, и $|\vec n| = S$ — площадь параллелограмма в основании (утверждение [-@prop:lec13:collinear]). По связи скалярного произведения с проекцией $\langle \vec a, \vec b, \vec c \rangle = (\vec n, \vec c) = |\vec n| \operatorname{pr}_{\vec n} \vec c$. Так как $\vec n$ перпендикулярен основанию, модуль проекции $|\operatorname{pr}_{\vec n} \vec c| = h$ — высота параллелепипеда, откуда $|\langle \vec a, \vec b, \vec c \rangle| = Sh = V$.

*Знак.* $\operatorname{pr}_{\vec n} \vec c > 0$ ровно тогда, когда $\vec c$ лежит по ту же сторону от плоскости $\vec a, \vec b$, что и $\vec n$. Тройка $\vec a, \vec b, \vec n$ правая по определению [-@def:lec13:cross], поэтому при $\operatorname{pr}_{\vec n} \vec c > 0$ тройка $\vec a, \vec b, \vec c$ правая (замечание [-@rem:lec13:orientation-facts]). Если $\operatorname{pr}_{\vec n} \vec c < 0$, то по одну сторону с $\vec n$ лежит $-\vec c$, значит, $\vec a, \vec b, -\vec c$ правая, а $\vec a, \vec b, \vec c$ левая. Для тетраэдра: $V_{\text{тетр}} = \frac13 S_{\triangle} h = \frac13 \cdot \frac12 S \cdot h = \frac16 V$.
:::

## 14. Общее уравнение плоскости в ПДСК {#sec:exam1:plane-equation}

::: {.definition ref="def:lec14:surface"}
*Уравнение множества* $S$ в ПДСК — уравнение $F(x, y, z) = 0$, которому удовлетворяют координаты точек $S$ и только они; $S$ — *геометрический образ* уравнения.
:::

::: {.definition ref="def:lec14:normal"}
*Нормальный вектор* (нормаль) плоскости — любой ненулевой вектор, перпендикулярный всем векторам, параллельным плоскости.
:::

::: {.theorem ref="thm:lec14:plane-equation"}
В ПДСК (1) любая плоскость задаётся уравнением $Ax + By + Cz + D = 0$ с $A^2 + B^2 + C^2 > 0$ и нормалью $\vec n = (A, B, C)$; (2) обратно, любое такое уравнение с $A^2 + B^2 + C^2 > 0$ задаёт плоскость с нормалью $(A, B, C)$.
:::

::: {.remark #rem:exam1:proof-plane-equation title="доказательство"}
*П. 1 (плоскость $\Rightarrow$ линейное уравнение).* Возьмём точку $M_0(x_0, y_0, z_0)$ на плоскости $\pi$ и её нормаль $\vec n = (A, B, C) \ne \vec 0$ (значит, $A^2 + B^2 + C^2 > 0$). Точка $M(x, y, z)$ лежит на $\pi$ тогда и только тогда, когда $\overrightarrow{M_0 M} \perp \vec n$, то есть в ПДСК (следствие [-@cor:lec12:onb])
$$(\vec n, \overrightarrow{M_0 M}) = 0 \;\Leftrightarrow\; A(x - x_0) + B(y - y_0) + C(z - z_0) = 0.$$
Раскрыв скобки и обозначив $D = -Ax_0 - By_0 - Cz_0$, получаем $Ax + By + Cz + D = 0$.

*П. 2 (линейное уравнение $\Rightarrow$ плоскость).* Так как $A^2 + B^2 + C^2 > 0$, хотя бы один коэффициент отличен от нуля; пусть для определённости $A \ne 0$. Тогда уравнение имеет решение $M_0\!\left(-\frac{D}{A}, 0, 0\right)$: $Ax_0 + By_0 + Cz_0 + D = 0$. Вычтем это равенство из $Ax + By + Cz + D = 0$: уравнение равносильно $A(x - x_0) + B(y - y_0) + C(z - z_0) = 0$, то есть $(\vec n, \overrightarrow{M_0 M}) = 0$ для ненулевого вектора $\vec n = (A, B, C)$. Множество всех точек $M$ с $\overrightarrow{M_0 M} \perp \vec n$ — единственная плоскость через $M_0$, перпендикулярная $\vec n$.
:::

## 15. Критерий подгруппы {#sec:exam1:subgroup-criterion}

::: {.definition ref="def:lec16:group"}
*Группа* $(G, *)$ — множество с ассоциативной бинарной операцией, в котором есть нейтральный элемент $e$ ($xe = ex = x$) и у каждого $x \in G$ есть обратный $x^{-1}$ ($xx^{-1} = x^{-1}x = e$).
:::

::: {.definition ref="def:lec16:subgroup"}
Подмножество $H \subseteq G$ называется *подгруппой* ($H \le G$), если $e \in H$, $h_1 h_2 \in H$ и $h^{-1} \in H$ для всех $h, h_1, h_2 \in H$.
:::

::: {.theorem ref="thm:lec16:criterion"}
Непустое подмножество $H \subseteq G$ группы $G$ является подгруппой тогда и только тогда, когда $h_1 h_2^{-1} \in H$ для всех $h_1, h_2 \in H$.
:::

::: {.remark #rem:exam1:proof-subgroup-criterion title="доказательство"}
*Необходимость.* Если $H \le G$ и $h_1, h_2 \in H$, то $h_2^{-1} \in H$ (замкнутость относительно взятия обратного), а значит, и $h_1 h_2^{-1} \in H$ (замкнутость относительно операции).

*Достаточность.* Пусть $H \ne \varnothing$ и $\forall h_1, h_2 \in H\colon h_1 h_2^{-1} \in H$.

1. *Нейтральный:* так как $H \ne \varnothing$, возьмём $h \in H$; тогда $e = h h^{-1} \in H$.
2. *Обратный:* для любого $h \in H$ имеем $e \in H$, поэтому $h^{-1} = e h^{-1} \in H$.
3. *Операция:* для любых $h_1, h_2 \in H$ по п. 2 имеем $h_2^{-1} \in H$, а значит, $h_1 h_2 = h_1 (h_2^{-1})^{-1} \in H$.

Все три условия определения [-@def:lec16:subgroup] выполнены, следовательно, $H \le G$.
:::

::: {.remark #rem:exam1:empty-subgroup tag="подводный камень"}
Условие $H \ne \varnothing$ обязательно: для пустого множества условие «$\forall h_1, h_2 \in \varnothing\colon h_1 h_2^{-1} \in \varnothing$» истинно, но $\varnothing$ не подгруппа ($e \notin \varnothing$). На проверке всегда сначала покажите, что $e \in H$ (или укажите хоть один элемент $H$).
:::

# Определения

::: {.definition ref="def:lec10:algebraic"}
*Алгебраическая форма* комплексного числа: $z = x + iy$, где $i = (0, 1)$, $i^2 = -1$, $x = \operatorname{Re} z \in \R$ — действительная часть, $y = \operatorname{Im} z \in \R$ — мнимая часть.
:::

::: {.definition ref="def:lec11:conjugate"}
*Комплексно сопряжённое* к $z = x + iy$: $\bar z = x - iy$.
:::

::: {.proposition ref="prop:lec11:complex-division"}
Деление в алгебраической форме: при $z_2 \ne 0$ имеем $z_2^{-1} = \frac{\bar z_2}{|z_2|^2}$ и $\frac{z_1}{z_2} = \frac{z_1 \bar z_2}{|z_2|^2}$ (домножить числитель и знаменатель на $\bar z_2$).
:::

::: {.definition ref="def:lec11:euler"}
*Формула Эйлера:* $e^{i\varphi} := \cos \varphi + i \sin \varphi$; показательная форма $z = r e^{i\varphi}$.
:::

::: {.corollary ref="cor:lec11:euler-cos-sin"}
Выражения косинуса и синуса через экспоненту: $\cos \varphi = \frac{e^{i\varphi} + e^{-i\varphi}}{2}$, $\sin \varphi = \frac{e^{i\varphi} - e^{-i\varphi}}{2i}$.
:::

::: {.theorem ref="thm:lec11:fta"}
*Основная теорема алгебры:* любой многочлен степени $n \ge 1$ с комплексными коэффициентами имеет хотя бы один комплексный корень.
:::

::: {.definition ref="def:lec12:multiplicity"}
*Корень кратности* $k$: число $c$, для которого $f(z) = (z - c)^k g(z)$ и $g(c) \ne 0$.
:::

::: {.theorem ref="thm:lec12:vieta"}
*Формулы Виета* для $x^n + a_1 x^{n-1} + \dots + a_n$ с корнями $c_1, \dots, c_n$: $\sigma_k = (-1)^k a_k$. При $n = 3$: $c_1 + c_2 + c_3 = -a_1$, $c_1 c_2 + c_1 c_3 + c_2 c_3 = a_2$, $c_1 c_2 c_3 = -a_3$.
:::

::: {.definition ref="def:lec12:basis"}
*Базис* в $V_3$ — упорядоченная тройка некомпланарных векторов (в $V_2$ — пара неколлинеарных).
:::

::: {.definition ref="def:lec12:onb"}
*Ортонормированный базис (ОНБ)*: $(\vec e_i, \vec e_j) = \delta_{ij}$ ($\Gamma = E$).
:::

::: {.corollary ref="cor:lec12:onb"}
В ОНБ $(\vec x, \vec y) = x_1 y_1 + x_2 y_2 + x_3 y_3$, $|\vec x| = \sqrt{x_1^2 + x_2^2 + x_3^2}$.
:::

::: {.definition ref="def:lec13:orientation"}
Некомпланарная упорядоченная тройка $\vec a, \vec b, \vec c$ *правая*, если с конца $\vec c$ кратчайший поворот от $\vec a$ к $\vec b$ виден против часовой стрелки; иначе *левая*.
:::

::: {.proposition ref="prop:lec13:collinear"}
*Критерий коллинеарности:* $[\vec a, \vec b] = \vec 0 \Leftrightarrow \vec a, \vec b$ коллинеарны. Площадь параллелограмма на $\vec a, \vec b$ равна $|[\vec a, \vec b]|$, треугольника — $\frac12 |[\vec a, \vec b]|$.
:::

::: {.theorem ref="thm:lec13:mixed-coords"}
В правом ОНБ смешанное произведение $\langle \vec a, \vec b, \vec c \rangle$ равно определителю $3 \times 3$ из координат векторов $\vec a, \vec b, \vec c$ (записанных строками).
:::

::: {.definition ref="def:lec13:cartesian"}
*Прямоугольная декартова система координат (ПДСК)* — точка $O$ (начало координат) и ортонормированный базис $\vec i, \vec j, \vec k$; координаты точки $M$ — координаты радиус-вектора $\overrightarrow{OM}$.
:::

::: {.definition ref="def:lec14:intercepts"}
*Уравнение плоскости в отрезках:* $\frac{x}{a} + \frac{y}{b} + \frac{z}{c} = 1$ ($abc \ne 0$); $a, b, c$ — отрезки со знаком, отсекаемые на осях $Ox, Oy, Oz$ (пересечения $(a,0,0)$, $(0,b,0)$, $(0,0,c)$).
:::

::: {.theorem ref="thm:lec14:two-planes"}
Две плоскости (матрица $F$ коэффициентов $A, B, C$ и расширенная $G$ со столбцом $D$): совпадают $\Leftrightarrow \operatorname{Rg} G = 1$; параллельны $\Leftrightarrow \operatorname{Rg} F = 1$, $\operatorname{Rg} G = 2$; пересекаются по прямой $\Leftrightarrow \operatorname{Rg} F = 2$ (направляющий вектор $[\vec n_1, \vec n_2]$).
:::

::: {.definition ref="def:lec14:angle-planes"}
*Угол между плоскостями:* $\cos \varphi = \frac{|(\vec n_1, \vec n_2)|}{|\vec n_1|\,|\vec n_2|}$, $\varphi \in [0, \frac{\pi}{2}]$.
:::

::: {.definition ref="def:lec14:direction"}
*Направляющий вектор прямой* — ненулевой вектор $\vec s$, параллельный прямой. Уравнения прямой через $M_0$ с направляющим $\vec s = (s_1, s_2, s_3)$: векторное $\vec r = \vec r_0 + t\vec s$; параметрические $x = x_0 + s_1 t$, $y = y_0 + s_2 t$, $z = z_0 + s_3 t$; канонические $\frac{x - x_0}{s_1} = \frac{y - y_0}{s_2} = \frac{z - z_0}{s_3}$; общие — система уравнений двух пересекающихся плоскостей.
:::

::: {.theorem ref="thm:lec14:line-plane"}
Прямая пересекает плоскость в единственной точке $\Leftrightarrow (\vec n, \vec s) \ne 0$; при $(\vec n, \vec s) = 0$ прямая лежит в плоскости ($M_0 \in \pi$) или параллельна ей ($M_0 \notin \pi$).
:::

::: {.definition ref="def:lec14:angle-line-plane"}
*Угол между прямой и плоскостью:* $\sin \psi = \frac{|(\vec n, \vec s)|}{|\vec n|\,|\vec s|}$, $\psi \in [0, \frac{\pi}{2}]$.
:::

::: {.theorem ref="thm:lec14:two-lines"}
*Критерий принадлежности двух прямых одной плоскости:* $\langle \overrightarrow{M_1 M_2}, \vec s_1, \vec s_2 \rangle = 0$ (иначе скрещиваются). При $[\vec s_1, \vec s_2] \ne \vec 0$ и нулевом смешанном произведении прямые пересекаются; при $[\vec s_1, \vec s_2] = \vec 0$ параллельны или совпадают.
:::

::: {.definition ref="def:lec14:direction-cosines"}
*Направляющие косинусы* ненулевого $\vec a$ в ОНБ: $\cos \alpha = \frac{a_1}{|\vec a|}$, $\cos \beta = \frac{a_2}{|\vec a|}$, $\cos \gamma = \frac{a_3}{|\vec a|}$ ($\cos^2 \alpha + \cos^2 \beta + \cos^2 \gamma = 1$).
:::

::: {.definition ref="def:lec14:normal-equation"}
*Нормальное уравнение плоскости:* $x\cos\alpha + y\cos\beta + z\cos\gamma - p = 0$ ($p \ge 0$ — расстояние от $O$).
:::

::: {.proposition ref="prop:lec14:point-plane"}
Расстояние от точки $M_0(x_0, y_0, z_0)$ до плоскости $Ax + By + Cz + D = 0$: $\rho(M_0, \pi) = \frac{|Ax_0 + By_0 + Cz_0 + D|}{\sqrt{A^2 + B^2 + C^2}}$.
:::

::: {.definition ref="def:lec15:injection"}
Отображение $f\colon X \to Y$ *инъективно*, если $x_1 \ne x_2 \Rightarrow f(x_1) \ne f(x_2)$; *сюръективно*, если $\operatorname{Im} f = Y$; *биективно*, если инъективно и сюръективно.
:::

::: {.definition ref="def:lec15:operation"}
*Бинарная операция* на $X$ — отображение $X \times X \to X$; *ассоциативна*, если $(a * b) * c = a * (b * c)$; *коммутативна*, если $a * b = b * a$.
:::

::: {.definition ref="def:lec15:groupoid"}
*Группоид* $(M, *)$ — множество с бинарной операцией; *полугруппа* — группоид с ассоциативной операцией.
:::

::: {.definition ref="def:lec15:neutral"}
*Нейтральный элемент*: $e * x = x * e = x$ для всех $x$; *моноид* — полугруппа с нейтральным элементом.
:::

::: {.definition ref="def:lec15:group"}
*Группа* — моноид, все элементы которого обратимы (эквивалентно определению [-@def:lec16:group]).
:::

::: {.definition ref="def:lec16:symmetric"}
*Симметрическая группа* $S_n$ — множество всех подстановок длины $n$ с умножением подстановок; $|S_n| = n!$.
:::

::: {.definition ref="def:lec16:gl"}
*Общая линейная группа* $GL_n(\R) = \{A \in M_n(\R) \mid \det A \ne 0\}$ с умножением матриц.
:::

::: {.definition ref="def:lec16:sl"}
*Специальная линейная группа* $SL_n(\R) = \{A \in M_n(\R) \mid \det A = 1\}$ — подгруппа $GL_n(\R)$.
:::

::: {.definition ref="def:lec16:order"}
*Порядок группы* $|G|$ — число её элементов (конечная или бесконечная группа).
:::

::: {.definition ref="def:lec16:abelian"}
*Абелева (коммутативная) группа* — группа с коммутативной операцией.
:::

::: {.definition ref="def:lec16:homomorphism"}
*Гомоморфизм групп* $f\colon (G_1, *) \to (G_2, \star)$ — отображение с $f(a * b) = f(a) \star f(b)$ для всех $a, b \in G_1$.
:::

::: {.definition ref="def:lec16:iso"}
*Изоморфизм групп* — биективный гомоморфизм ($G_1 \cong G_2$); инъективный — *мономорфизм*, сюръективный — *эпиморфизм*.
:::

::: {.proposition ref="prop:lec16:iso-props"}
$\Id_G$ — изоморфизм; обратный к изоморфизму — изоморфизм; композиция гомоморфизмов (изоморфизмов) — гомоморфизм (изоморфизм).
:::

::: {.definition ref="def:lec16:cayley"}
*Таблица Кэли* конечной группы: на пересечении строки $g_i$ и столбца $g_j$ стоит $g_i g_j$.
:::

::: {.definition ref="def:lec17:order"}
*Порядок элемента* $\operatorname{ord} a$ — наименьшее целое $q \ge 1$ с $a^q = e$ (иначе $\operatorname{ord} a = \infty$).
:::

::: {.definition ref="def:lec17:cyclic"}
*Циклическая группа* — группа вида $G = \langle a \rangle = \{a^n \mid n \in \Z\}$ для некоторого *порождающего* элемента $a$.
:::

::: {.theorem ref="thm:lec17:cyclic-iso"}
Бесконечная циклическая группа изоморфна $(\Z, +)$, циклическая группа порядка $n$ изоморфна $(\Z_n, +)$; любые две циклические группы одного порядка изоморфны.
:::

# Задачи

## 1. СЛАУ: совместность, общее решение и ФСР {#sec:exam1:slau}

1. Запишите расширенную матрицу $(A \mid b)$ и приведите её строковыми преобразованиями к ступенчатому виду; сравните $\operatorname{Rg} A$ и $\operatorname{Rg}(A \mid b)$ по теореме Кронекера–Капелли [-@thm:lec08:kronecker-capelli].
2. Доведите матрицу до канонического вида. Выделите главные переменные (столбцы ведущих единиц) и свободные; выразите главные через свободные.
3. Частное решение $\tilde x$: положите свободные равными $0$, главные возьмите из последнего столбца *со своим знаком*.
4. Нормальная ФСР однородной системы: отбросьте столбец правых частей; коэффициенты при свободных переносите в правую часть *с противоположным знаком*, задавая свободным наборы $(1, 0, \dots, 0)$, $(0, 1, \dots, 0)$ и т. д.
5. Проверьте подстановкой в исходную систему: $A\tilde x = b$ и $A\Phi_j = 0$.
6. Если просят проверить, образуют ли данные столбцы ФСР $Ax = 0$: проверьте три вещи — (1) каждый столбец решает $Ax = 0$, (2) их число равно $n - \operatorname{Rg} A$, (3) они линейно независимы (ранг составленной из них матрицы равен их числу).

::: {.problem #prob:exam1:slau-general}
Исследуйте систему на совместность и найдите её общее решение в векторном виде с выделенным частным решением и ФСР однородной системы:
$$\begin{cases} x_1 + x_2 + x_3 + x_4 = 2, \\ 2x_1 + x_2 + 3x_3 = 5, \\ x_1 - x_2 + 3x_3 - 3x_4 = 4. \end{cases}$$
:::

::: solution
Приводим расширенную матрицу к ступенчатому виду ($\rw{II} - 2\cdot\rw{I}$, $\rw{III} - \rw{I}$, затем $\rw{III} - 2\cdot\rw{II}$):
$$\begin{pmatrix} 1 & 1 & 1 & 1 & | & 2 \\ 2 & 1 & 3 & 0 & | & 5 \\ 1 & -1 & 3 & -3 & | & 4 \end{pmatrix} \to \begin{pmatrix} 1 & 1 & 1 & 1 & | & 2 \\ 0 & -1 & 1 & -2 & | & 1 \\ 0 & -2 & 2 & -4 & | & 2 \end{pmatrix} \to \begin{pmatrix} 1 & 1 & 1 & 1 & | & 2 \\ 0 & -1 & 1 & -2 & | & 1 \\ 0 & 0 & 0 & 0 & | & 0 \end{pmatrix}.$$
Имеем $\operatorname{Rg} A = \operatorname{Rg}(A \mid b) = 2$, поэтому система совместна (теорема [-@thm:lec08:kronecker-capelli]). Доводим до канонического вида ($\rw{II} \cdot (-1)$, затем $\rw{I} - \rw{II}$):
$$\begin{pmatrix} 1 & 0 & 2 & -1 & | & 3 \\ 0 & 1 & -1 & 2 & | & -1 \\ 0 & 0 & 0 & 0 & | & 0 \end{pmatrix}, \qquad \begin{cases} x_1 = 3 - 2x_3 + x_4, \\ x_2 = -1 + x_3 - 2x_4. \end{cases}$$
Главные переменные — $x_1, x_2$, свободные — $x_3, x_4$. Полагая $x_3 = x_4 = 0$, получаем частное решение $\tilde x = (3, -1, 0, 0)^T$. Для однородной системы ($x_1 = -2x_3 + x_4$, $x_2 = x_3 - 2x_4$) при $(x_3, x_4) = (1, 0)$ и $(0, 1)$ находим нормальную ФСР: $\Phi_1 = (-2, 1, 1, 0)^T$, $\Phi_2 = (1, -2, 0, 1)^T$. Проверка: для $\tilde x$ имеем $3 - 1 = 2$, $6 - 1 = 5$, $3 + 1 = 4$; для $\Phi_1$: $-2 + 1 + 1 = 0$, $-4 + 1 + 3 = 0$, $-2 - 1 + 3 = 0$; для $\Phi_2$: $1 - 2 + 1 = 0$, $2 - 2 = 0$, $1 + 2 - 3 = 0$.

*Ответ:* система совместна; $x = (3, -1, 0, 0)^T + c_1(-2, 1, 1, 0)^T + c_2(1, -2, 0, 1)^T$, $c_1, c_2 \in \R$.
:::

::: {.problem #prob:exam1:slau-is-fsr}
Дана однородная система $\begin{cases} x_1 + x_2 - x_3 + 2x_4 = 0, \\ 2x_1 + x_2 + x_3 + x_4 = 0 \end{cases}$ и столбцы $v_1 = (-1, 0, 1, 1)^T$, $v_2 = (-3, 6, 1, -1)^T$, $v_3 = (2, -6, 0, 2)^T$, $v_4 = (1, 1, 0, 1)^T$. Какие пары столбцов образуют ФСР этой системы?
:::

::: solution
Сначала найдём число векторов в ФСР: $\rw{II} - 2\cdot\rw{I}$ даёт строки $(1, 1, -1, 2)$ и $(0, -1, 3, -3)$, минор $M^{12}_{12} = -1 \ne 0$, значит, $\operatorname{Rg} A = 2$ и ФСР состоит из $n - r = 4 - 2 = 2$ линейно независимых решений.

Проверим, какие столбцы — решения:

- $v_1$: $-1 + 0 - 1 + 2 = 0$, $-2 + 0 + 1 + 1 = 0$ — решение;
- $v_2$: $-3 + 6 - 1 - 2 = 0$, $-6 + 6 + 1 - 1 = 0$ — решение;
- $v_3$: $2 - 6 - 0 + 4 = 0$, $4 - 6 + 0 + 2 = 0$ — решение;
- $v_4$: $1 + 1 - 0 + 2 = 4 \ne 0$ — не решение (пары с $v_4$ сразу отпадают).

*Ключ:* для проверки независимости пары столбцов достаточно найти один ненулевой минор $2 \times 2$ (или проверить непропорциональность). По последним двум координатам: у $(v_1, v_2)$ определитель $\begin{vmatrix} 1 & 1 \\ 1 & -1 \end{vmatrix} = -2 \ne 0$; у $(v_1, v_3)$ — $\begin{vmatrix} 1 & 0 \\ 1 & 2 \end{vmatrix} = 2 \ne 0$; у $(v_2, v_3)$ — $\begin{vmatrix} 1 & 0 \\ -1 & 2 \end{vmatrix} = 2 \ne 0$. Все три пары решений непропорциональны, то есть линейно независимы.

*Ответ:* $(v_1, v_2)$, $(v_1, v_3)$ и $(v_2, v_3)$.
:::

Ещё задачи: [-@prob:lec10:general-middle], [-@prob:lec10:param], [-@prob:lec09:is-fsr].

## 2. $LU$-разложение матрицы {#sec:exam1:lu}

1. Ищется представление $A = LU$, где $L$ — нижнетреугольная с единицами на главной диагонали, $U$ — верхнетреугольная.
2. Приведите $A$ к верхнетреугольному виду $U$ *только* элементарными преобразованиями третьего типа сверху вниз ($\rwv{i} - l_{ik}\rwv{k}$, $i > k$, без перестановок строк). Коэффициенты $l_{ik}$ (с плюсом, если вычитали $l_{ik}\rwv{k}$) встают в $L$ на место $(i, k)$.
3. Для невырожденной матрицы $LU$-разложение существует (и единственно) тогда и только тогда, когда все её главные угловые миноры отличны от нуля. Если ведущий элемент $u_{kk} = 0$, а под ним в $k$-м столбце есть ненулевой элемент, то $LU$-разложения нет: убедитесь в этом напрямую, приравняв элементы произведения $LU$ к $A$.
4. Обязательно проверьте ответ прямым умножением $L \cdot U = A$.

::: {.problem #prob:exam1:lu-yes}
Найдите $LU$-разложение матрицы $A = \begin{pmatrix} 2 & -1 & 3 \\ 4 & -1 & 4 \\ -2 & 4 & -5 \end{pmatrix}$ ($L$ — нижнетреугольная с единицами на диагонали, $U$ — верхнетреугольная).
:::

::: solution
Приводим $A$ к верхнетреугольному виду преобразованиями только третьего типа сверху вниз. Первый столбец: $\rw{II} - 2\cdot\rw{I}$ ($l_{21} = 2$) и $\rw{III} - (-1)\cdot\rw{I}$ ($l_{31} = -1$):
$$\begin{pmatrix} 2 & -1 & 3 \\ 4 & -1 & 4 \\ -2 & 4 & -5 \end{pmatrix} \to \begin{pmatrix} 2 & -1 & 3 \\ 0 & 1 & -2 \\ 0 & 3 & -2 \end{pmatrix}.$$
Второй столбец: $\rw{III} - 3\cdot\rw{II}$ ($l_{32} = 3$):
$$U = \begin{pmatrix} 2 & -1 & 3 \\ 0 & 1 & -2 \\ 0 & 0 & 4 \end{pmatrix}, \qquad L = \begin{pmatrix} 1 & 0 & 0 \\ 2 & 1 & 0 \\ -1 & 3 & 1 \end{pmatrix}.$$
Проверка умножением: первая строка $LU$ равна $(2, -1, 3)$; вторая — $2(2, -1, 3) + (0, 1, -2) = (4, -1, 4)$; третья — $-(2, -1, 3) + 3(0, 1, -2) + (0, 0, 4) = (-2, 4, -5)$.

*Ответ:* $L = \begin{pmatrix} 1 & 0 & 0 \\ 2 & 1 & 0 \\ -1 & 3 & 1 \end{pmatrix}$, $U = \begin{pmatrix} 2 & -1 & 3 \\ 0 & 1 & -2 \\ 0 & 0 & 4 \end{pmatrix}$.
:::

::: {.problem #prob:exam1:lu-no}
Можно ли представить матрицу $A = \begin{pmatrix} 1 & 2 & 1 \\ 2 & 4 & 3 \\ 1 & 3 & 2 \end{pmatrix}$ в виде $A = LU$ ($L$ — нижнетреугольная с единицами на диагонали, $U$ — верхнетреугольная)?
:::

::: solution
*Ключ:* $\det A = -1 \ne 0$, но второй главный угловой минор $\Delta_2 = \begin{vmatrix} 1 & 2 \\ 2 & 4 \end{vmatrix} = 0$. Покажем напрямую, что разложения нет. Пусть
$$\begin{pmatrix} 1 & 0 & 0 \\ l_{21} & 1 & 0 \\ l_{31} & l_{32} & 1 \end{pmatrix} \begin{pmatrix} u_{11} & u_{12} & u_{13} \\ 0 & u_{22} & u_{23} \\ 0 & 0 & u_{33} \end{pmatrix} = \begin{pmatrix} 1 & 2 & 1 \\ 2 & 4 & 3 \\ 1 & 3 & 2 \end{pmatrix}.$$
Из первой строки: $u_{11} = 1$, $u_{12} = 2$. Из элемента $(2, 1)$: $l_{21} u_{11} = 2 \Rightarrow l_{21} = 2$. Из элемента $(2, 2)$: $l_{21} u_{12} + u_{22} = 4 \Rightarrow 4 + u_{22} = 4 \Rightarrow u_{22} = 0$. Из элемента $(3, 1)$: $l_{31} u_{11} = 1 \Rightarrow l_{31} = 1$. Тогда элемент $(3, 2)$ произведения равен $l_{31} u_{12} + l_{32} u_{22} = 1 \cdot 2 + l_{32} \cdot 0 = 2$, а в матрице $A$ на этом месте стоит $3$ — противоречие.

*Ответ:* нельзя.
:::

Ещё задачи: [-@prob:lec08:lu-degenerate], [-@prob:lec08:lu-param].

## 3. Линейные и квадратные уравнения над $\mathbb{C}$ {#sec:exam1:complex-eq}

1. Система $2 \times 2$ над $\mathbb{C}$: решайте методом подстановки, Гаусса или Крамера — все свойства поля работают (утверждение [-@prop:lec11:field]). Деление выполняйте домножением на сопряжённое (утверждение [-@prop:lec11:complex-division]).
2. Квадратное уравнение $az^2 + bz + c = 0$: вычислите дискриминант $D = b^2 - 4ac$ (обычно комплексное число).
3. Извлеките квадратный корень $d = x + iy$ из $D = u + iv$ алгебраически: $x^2 - y^2 = u$, $2xy = v$, плюс вспомогательное $x^2 + y^2 = |D| = \sqrt{u^2 + v^2}$ (складывайте и вычитайте с первым уравнением, знак $xy$ определяет, одинаковы ли знаки $x$ и $y$).
4. Корни $z_{1,2} = \frac{-b \pm d}{2a}$; проверьте по теореме Виета ($z_1 + z_2 = -\frac ba$, $z_1 z_2 = \frac ca$).

::: {.problem #prob:exam1:complex-system}
Решите систему линейных уравнений над $\mathbb{C}$:
$$\begin{cases} (1 + i)z_1 + (2 - i)z_2 = 7 + 4i, \\ (2 - i)z_1 - i z_2 = 5 - 5i. \end{cases}$$
:::

::: solution
*Ключ:* из второго уравнения $z_2$ выражается без дробей — умножим его на $i$ (так как $i(-i) = 1$):
$$i(2 - i)z_1 + z_2 = i(5 - 5i) \;\Rightarrow\; z_2 = (5 + 5i) - (1 + 2i)z_1.$$
Подставим в первое уравнение:
$$(1 + i)z_1 + (2 - i)(5 + 5i) - (2 - i)(1 + 2i)z_1 = 7 + 4i.$$
Вычислим произведения: $(2 - i)(5 + 5i) = 10 + 10i - 5i + 5 = 15 + 5i$ и $(2 - i)(1 + 2i) = 2 + 4i - i + 2 = 4 + 3i$. Приводим подобные:
$$\big((1 + i) - (4 + 3i)\big)z_1 = (7 + 4i) - (15 + 5i) \;\Rightarrow\; (-3 - 2i)z_1 = -8 - i.$$
Делим через сопряжённое (утверждение [-@prop:lec11:complex-division]):
$$z_1 = \frac{8 + i}{3 + 2i} = \frac{(8 + i)(3 - 2i)}{3^2 + 2^2} = \frac{24 - 16i + 3i + 2}{13} = \frac{26 - 13i}{13} = 2 - i.$$
Тогда $z_2 = (5 + 5i) - (1 + 2i)(2 - i) = (5 + 5i) - (4 + 3i) = 1 + 2i$. Проверка: $(1 + i)(2 - i) + (2 - i)(1 + 2i) = (3 + i) + (4 + 3i) = 7 + 4i$; $(2 - i)^2 - i(1 + 2i) = (3 - 4i) + (2 - i) = 5 - 5i$.

*Ответ:* $z_1 = 2 - i$, $z_2 = 1 + 2i$.
:::

::: {.problem #prob:exam1:complex-quadratic}
Решите уравнение $z^2 - (5 + i)z + (8 + 4i) = 0$ в $\mathbb{C}$.
:::

::: solution
Дискриминант: $D = (5 + i)^2 - 4(8 + 4i) = 24 + 10i - 32 - 16i = -8 - 6i$. Найдём $d = x + iy$ с $d^2 = -8 - 6i$:
$$\begin{cases} x^2 - y^2 = -8, \\ 2xy = -6, \\ x^2 + y^2 = \sqrt{(-8)^2 + (-6)^2} = 10. \end{cases}$$
Складывая и вычитая первое и третье уравнения: $2x^2 = 2 \Rightarrow x = \pm 1$, $2y^2 = 18 \Rightarrow y = \pm 3$. Так как $2xy = -6 < 0$, знаки $x$ и $y$ противоположны: $d = \pm(1 - 3i)$. Проверка: $(1 - 3i)^2 = 1 - 6i - 9 = -8 - 6i$.

Находим корни:
$$z_1 = \frac{(5 + i) + (1 - 3i)}{2} = 3 - i, \qquad z_2 = \frac{(5 + i) - (1 - 3i)}{2} = 2 + 2i.$$
Проверка по Виета: $z_1 + z_2 = 5 + i$, $z_1 z_2 = (3 - i)(2 + 2i) = 6 + 6i - 2i + 2 = 8 + 4i$.

*Ответ:* $3 - i$ и $2 + 2i$.
:::

Ещё задачи: [-@prob:lec11:linear-system], [-@prob:lec11:quadratic].

## 4. Степени и корни $n$-й степени из комплексных чисел {#sec:exam1:complex-roots}

1. Приведите каждое число к тригонометрической форме $r(\cos \varphi + i \sin \varphi)$ с $r > 0$ и знаком «$+$» (определяйте четверть по знакам $x, y$, не используйте $\operatorname{arctg}\frac yx$ вслепую).
2. Для дроби со степенями возведите каждый множитель по формуле Муавра [-@thm:lec11:moivre], затем перемножьте/поделите модули и сложите/вычтите аргументы (теорема [-@thm:lec11:trig-mult]); приведите итоговый угол по модулю $2\pi$ и перейдите к алгебраической форме.
3. Для корней $z^n = w$: запишите $w = \rho(\cos \psi + i \sin \psi)$ и выпишите все $n$ корней по теореме [-@thm:lec11:roots] ($k = 0, \dots, n - 1$).
4. Если нужно отобрать корни по условию на $\arg z$ или $\arg\!\left(\frac{z}{c}\right)$, переведите углы в $(-\pi, \pi]$ (или вычтите аргумент $c$ и приведите к нужному промежутку) и выберите подходящие $k$.

::: {.problem #prob:exam1:complex-power}
Вычислите в алгебраической форме $\dfrac{(1 - i\sqrt3)^7 (-1 - i)^6}{(\sqrt3 + i)^4}$.
:::

::: solution
Переведём основания в тригонометрическую форму:

- $1 - i\sqrt3$: $r = 2$, IV четверть, $\varphi = -\frac{\pi}{3}$;
- $-1 - i$: $r = \sqrt2$, III четверть, $\varphi = -\frac{3\pi}{4}$;
- $\sqrt3 + i$: $r = 2$, I четверть, $\varphi = \frac{\pi}{6}$.

По формуле Муавра [-@thm:lec11:moivre] и теореме [-@thm:lec11:trig-mult] модуль дроби равен $\frac{2^7 \cdot (\sqrt2)^6}{2^4} = 2^3 \cdot 8 = 64$, а аргумент равен
$$7\left(-\frac{\pi}{3}\right) + 6\left(-\frac{3\pi}{4}\right) - 4\cdot\frac{\pi}{6} = -\frac{7\pi}{3} - \frac{9\pi}{2} - \frac{2\pi}{3} = -3\pi - \frac{9\pi}{2} = -\frac{15\pi}{2}.$$
Прибавим $8\pi$: $-\frac{15\pi}{2} + 8\pi = \frac{\pi}{2}$. Значит, дробь равна $64\left(\cos \frac{\pi}{2} + i \sin \frac{\pi}{2}\right) = 64i$.

*Ответ:* $64i$.
:::

::: {.problem #prob:exam1:complex-roots-filter}
Найдите все корни уравнения $z^4 + 8 - 8i\sqrt3 = 0$, для которых $\dfrac{\pi}{2} < \arg\!\left(\dfrac{z}{1 + i}\right) < \pi$ (главное значение аргумента в $(-\pi, \pi]$).
:::

::: solution
Запишем $z^4 = -8 + 8i\sqrt3 = 16\left(-\frac12 + \frac{\sqrt3}{2}i\right) = 16\left(\cos \frac{2\pi}{3} + i \sin \frac{2\pi}{3}\right)$. По теореме [-@thm:lec11:roots] все $4$ корня имеют модуль $\sqrt[4]{16} = 2$ и аргументы
$$\varphi_k = \frac{\frac{2\pi}{3} + 2\pi k}{4} = \frac{\pi}{6} + \frac{\pi k}{2}, \qquad k = 0, 1, 2, 3,$$
то есть $\frac{\pi}{6}$, $\frac{2\pi}{3}$, $\frac{7\pi}{6}$, $\frac{5\pi}{3}$.

*Ключ:* так как $\arg(1 + i) = \frac{\pi}{4}$, аргументы частных $\frac{z_k}{1 + i}$ равны $\alpha_k = \varphi_k - \frac{\pi}{4}$ (с точностью до $2\pi$):

- $k = 0$: $\alpha_0 = \frac{\pi}{6} - \frac{\pi}{4} = -\frac{\pi}{12} \in (-\pi, \pi]$ — не подходит;
- $k = 1$: $\alpha_1 = \frac{2\pi}{3} - \frac{\pi}{4} = \frac{5\pi}{12} \in (-\pi, \pi]$ — меньше $\frac{\pi}{2}$, не подходит;
- $k = 2$: $\alpha_2 = \frac{7\pi}{6} - \frac{\pi}{4} = \frac{11\pi}{12} \in \left(\frac{\pi}{2}, \pi\right)$ — подходит;
- $k = 3$: $\alpha_3 = \frac{5\pi}{3} - \frac{\pi}{4} = \frac{17\pi}{12} \equiv -\frac{7\pi}{12} \pmod{2\pi}$ — не подходит.

Вычислим $z_2$: $z_2 = 2\left(\cos \frac{7\pi}{6} + i \sin \frac{7\pi}{6}\right) = 2\left(-\frac{\sqrt3}{2} - \frac{i}{2}\right) = -\sqrt3 - i$.

*Ответ:* $z = -\sqrt3 - i$.
:::

Ещё задачи: [-@prob:lec11:power], [-@prob:lec11:roots-arg], [-@prob:lec11:roots-quotient], [-@prob:lec11:fourth-roots].

## 5. Разложение многочленов над $\mathbb{C}$ и $\R$ {#sec:exam1:poly-factor}

1. Найдите все комплексные корни (для $x^n - w$ — по теореме [-@thm:lec11:roots]; для биквадратных — замена $t = x^2$; если дан невещественный корень $z_0$ вещественного многочлена — сразу берите и $\bar z_0$ по утверждению [-@prop:lec12:conjugate-root]).
2. Над $\mathbb{C}$ запишите $f(x) = a_n \prod (x - z_k)$ (следствие [-@cor:lec12:linear-factors]).
3. Над $\R$ объедините каждую пару сопряжённых корней $z_0, \bar z_0$ в вещественный квадратный множитель $(x - z_0)(x - \bar z_0) = x^2 - 2(\operatorname{Re} z_0) x + |z_0|^2$ с $D < 0$ (теорема [-@thm:lec12:real-factorization]).
4. Если дан один корень $z_0 \notin \R$, разделите $f(x)$ уголком на $x^2 - 2(\operatorname{Re} z_0)x + |z_0|^2$ — получите вещественное частное меньшей степени.

::: {.problem #prob:exam1:poly-x6}
Найдите все комплексные корни многочлена $x^6 + 64$ и разложите его на неприводимые множители над $\mathbb{C}$ и над $\R$.
:::

::: solution
Решаем $x^6 = -64 = 64(\cos \pi + i \sin \pi)$. По теореме [-@thm:lec11:roots] модуль каждого корня $\sqrt[6]{64} = 2$, аргументы $\varphi_k = \frac{\pi + 2\pi k}{6} = \frac{\pi}{6} + \frac{\pi k}{3}$ ($k = 0, \dots, 5$):
$$z_0 = \sqrt3 + i, \quad z_1 = 2i, \quad z_2 = -\sqrt3 + i, \quad z_3 = -\sqrt3 - i, \quad z_4 = -2i, \quad z_5 = \sqrt3 - i.$$
Над $\mathbb{C}$:
$$x^6 + 64 = (x - 2i)(x + 2i)(x - \sqrt3 - i)(x - \sqrt3 + i)(x + \sqrt3 - i)(x + \sqrt3 + i).$$
Группируем пары сопряжённых: $(x - 2i)(x + 2i) = x^2 + 4$; $(x - \sqrt3 - i)(x - \sqrt3 + i) = x^2 - 2\sqrt3\,x + 4$; $(x + \sqrt3 - i)(x + \sqrt3 + i) = x^2 + 2\sqrt3\,x + 4$. У всех трёх $D < 0$ ($-16$, $-4$, $-4$), значит, они неприводимы над $\R$.

*Ответ:* корни $\pm 2i$, $\pm\sqrt3 \pm i$; над $\mathbb{C}$ — произведение шести линейных множителей выше; над $\R$: $(x^2 + 4)(x^2 - 2\sqrt3\,x + 4)(x^2 + 2\sqrt3\,x + 4)$.
:::

::: {.problem #prob:exam1:poly-known-root}
Известно, что число $1 + 2i$ — корень многочлена $f(x) = x^4 - x^3 + x^2 + 9x - 10$. Найдите все корни $f$ и разложите $f$ на неприводимые множители над $\R$ и над $\mathbb{C}$.
:::

::: solution
Коэффициенты $f$ вещественны, поэтому $\overline{1 + 2i} = 1 - 2i$ — тоже корень (утверждение [-@prop:lec12:conjugate-root]). Произведение соответствующих линейных множителей:
$$(x - 1 - 2i)(x - 1 + 2i) = (x - 1)^2 + 4 = x^2 - 2x + 5.$$
Делим $f(x)$ на $x^2 - 2x + 5$ уголком:
$$x^4 - x^3 + x^2 + 9x - 10 = (x^2 - 2x + 5)(x^2 + x - 2).$$
Проверка: $(x^2 - 2x + 5)(x^2 + x - 2) = x^4 + (1 - 2)x^3 + (-2 - 2 + 5)x^2 + (4 + 5)x - 10 = x^4 - x^3 + x^2 + 9x - 10$. Корни $x^2 + x - 2 = 0$: $x = 1$ и $x = -2$.

*Ответ:* корни $1 + 2i$, $1 - 2i$, $1$, $-2$; над $\R$: $(x - 1)(x + 2)(x^2 - 2x + 5)$; над $\mathbb{C}$: $(x - 1)(x + 2)(x - 1 - 2i)(x - 1 + 2i)$.
:::

Ещё задачи: [-@prob:lec12:x6], [-@prob:lec12:known-root].

## 6. Векторная алгебра: скалярное, векторное и смешанное произведения {#sec:exam1:vectors}

1. Вектор $\vec x = (x_1, x_2, x_3)$ по условиям на скалярные произведения в ОНБ: каждое условие $(\vec x, \vec a) = d$ даёт линейное уравнение $a_1 x_1 + a_2 x_2 + a_3 x_3 = d$ (перпендикулярность — $d = 0$); решите полученную СЛАУ.
2. Площадь параллелограмма на $\alpha \vec p + \beta \vec q$ и $\gamma \vec p + \delta \vec q$: раскройте векторное произведение по линейности и антикоммутативности (теорема [-@thm:lec13:cross-props]), используя $[\vec p, \vec p] = [\vec q, \vec q] = \vec 0$ и $[\vec q, \vec p] = -[\vec p, \vec q]$; площадь — модуль результата.
3. Тетраэдр $ABCD$: отложите три ребра из одной вершины ($\overrightarrow{AB}, \overrightarrow{AC}, \overrightarrow{AD}$). Площадь грани $S_{\triangle ABC} = \frac12 |[\overrightarrow{AB}, \overrightarrow{AC}]|$; объём $V = \frac16 |\langle \overrightarrow{AB}, \overrightarrow{AC}, \overrightarrow{AD} \rangle|$ (следствие [-@cor:lec13:coplanar]); высота из $D$ на грань $ABC$ равна $h = \frac{3V}{S_{\triangle ABC}} = \frac{|\langle \overrightarrow{AB}, \overrightarrow{AC}, \overrightarrow{AD} \rangle|}{|[\overrightarrow{AB}, \overrightarrow{AC}]|}$. Не забудьте взять модуль: объём неотрицателен.

::: {.problem #prob:exam1:vec-dots}
В ортонормированном базисе даны $\vec a = (1, 2, 0)$, $\vec b = (1, 1, 1)$, $\vec c = (2, -1, 1)$. Найдите вектор $\vec x$, перпендикулярный $\vec a$, для которого $(\vec x, \vec b) = 4$ и $(\vec x, \vec c) = 8$.
:::

::: solution
Пусть $\vec x = (x_1, x_2, x_3)$. Условия $(\vec x, \vec a) = 0$, $(\vec x, \vec b) = 4$, $(\vec x, \vec c) = 8$ в ОНБ дают систему
$$\begin{cases} x_1 + 2x_2 = 0, \\ x_1 + x_2 + x_3 = 4, \\ 2x_1 - x_2 + x_3 = 8. \end{cases}$$
Из первого уравнения $x_1 = -2x_2$. Вычтем второе уравнение из третьего: $x_1 - 2x_2 = 4$. Подставляем $x_1 = -2x_2$: $-4x_2 = 4 \Rightarrow x_2 = -1$, откуда $x_1 = 2$. Из второго уравнения $x_3 = 4 - 2 - (-1) = 3$. Проверка: $2 + 2(-1) = 0$, $2 - 1 + 3 = 4$, $4 + 1 + 3 = 8$.

*Ответ:* $\vec x = (2, -1, 3)$.
:::

::: {.problem #prob:exam1:vec-tetra}
В ПДСК заданы вершины тетраэдра $A(1, 0, 2)$, $B(3, 1, 2)$, $C(1, 2, 4)$, $D(2, 3, 0)$. Найдите площадь грани $ABC$, объём тетраэдра и длину высоты, опущенной из вершины $D$ на грань $ABC$.
:::

::: solution
Находим рёбра из вершины $A$: $\overrightarrow{AB} = (2, 1, 0)$, $\overrightarrow{AC} = (0, 2, 2)$, $\overrightarrow{AD} = (1, 3, -2)$.

Векторное произведение (теорема [-@thm:lec13:cross-coords]):
$$[\overrightarrow{AB}, \overrightarrow{AC}] = \begin{vmatrix} \vec i & \vec j & \vec k \\ 2 & 1 & 0 \\ 0 & 2 & 2 \end{vmatrix} = (2, -4, 4), \qquad |[\overrightarrow{AB}, \overrightarrow{AC}]| = \sqrt{4 + 16 + 16} = 6.$$
Площадь грани $S_{\triangle ABC} = \frac12 \cdot 6 = 3$ (утверждение [-@prop:lec13:collinear]). Смешанное произведение:
$$\langle \overrightarrow{AB}, \overrightarrow{AC}, \overrightarrow{AD} \rangle = \big([\overrightarrow{AB}, \overrightarrow{AC}], \overrightarrow{AD}\big) = 2\cdot 1 + (-4)\cdot 3 + 4\cdot(-2) = -18.$$
По следствию [-@cor:lec13:coplanar] объём $V = \frac16 |-18| = 3$. Высота из $D$: $h = \frac{3V}{S_{\triangle ABC}} = \frac{9}{3} = 3$.

*Ответ:* $S_{\triangle ABC} = 3$, $V = 3$, $h = 3$.
:::

Ещё задачи: [-@prob:lec12:vector-by-dots], [-@prob:lec13:cross-algebra], [-@prob:lec13:tetra], [-@prob:lec13:double-cross], [-@prob:lec13:cross-equation].

## 7. Уравнения прямых и плоскостей, пучок плоскостей {#sec:exam1:planes-lines}

1. В треугольнике на плоскости $Oxy$: медиана проходит через вершину $A$ и середину $M = \frac{B + C}{2}$ (направляющий вектор $\overrightarrow{AM}$); высота из $A$ на $BC$ проходит через $A$ и имеет нормальный вектор $\overrightarrow{BC}$; биссектриса — направляющий вектор $\frac{\overrightarrow{AB}}{|\overrightarrow{AB}|} + \frac{\overrightarrow{AC}}{|\overrightarrow{AC}|}$ (сумма единичных векторов сторон).
2. Уравнение плоскости через точку $M_0$ и нормаль $\vec n = (A, B, C)$: $A(x - x_0) + B(y - y_0) + C(z - z_0) = 0$. Через точку и два неколлинеарных направляющих вектора $\vec p, \vec q$: $\vec n = [\vec p, \vec q]$ (или определитель [-@eq:lec14:two-vectors]).
3. *Пучок плоскостей* через линию пересечения $\pi_1\colon F_1 = 0$ и $\pi_2\colon F_2 = 0$: $\alpha F_1 + \beta F_2 = 0$ ($(\alpha, \beta) \ne (0, 0)$). Если плоскость $\pi_2$ заведомо не подходит, достаточно формы $F_1 + \lambda F_2 = 0$; иначе проверьте случай $\alpha = 0$ отдельно.
4. Условие на отрезки: из $Ax + By + Cz + D = 0$ ($D \ne 0$) отрезки равны $a = -\frac DA$, $b = -\frac DB$, $c = -\frac DC$ (определение [-@def:lec14:intercepts]); равенство отрезков $b = c$ даёт $B = C \ne 0$, равенство их длин $|b| = |c|$ даёт $B = \pm C \ne 0$.

::: {.problem #prob:exam1:triangle}
На плоскости задан треугольник $A(1, 2)$, $B(4, 6)$, $C(6, -10)$. Составьте общие уравнения медианы, высоты и биссектрисы, проведённых из вершины $A$.
:::

::: solution
*Медиана.* Середина стороны $BC$: $M = \left(\frac{4 + 6}{2}, \frac{6 - 10}{2}\right) = (5, -2)$. Направляющий вектор $\overrightarrow{AM} = (4, -4) = 4(1, -1)$, нормаль $\vec n_1 = (1, 1)$. Уравнение через $A(1, 2)$: $(x - 1) + (y - 2) = 0 \Leftrightarrow x + y - 3 = 0$. Проверка: $M(5, -2)$ даёт $5 - 2 - 3 = 0$.

*Высота.* Вектор стороны $\overrightarrow{BC} = (2, -16) = 2(1, -8)$ перпендикулярен высоте, значит, нормаль высоты — $\vec n_2 = (1, -8)$. Уравнение через $A(1, 2)$: $(x - 1) - 8(y - 2) = 0 \Leftrightarrow x - 8y + 15 = 0$.

*Биссектриса.* Векторы сторон $\overrightarrow{AB} = (3, 4)$ ($|\overrightarrow{AB}| = 5$) и $\overrightarrow{AC} = (5, -12)$ ($|\overrightarrow{AC}| = 13$). Сумма единичных векторов даёт направляющий вектор биссектрисы:
$$\vec s = \frac{1}{5}(3, 4) + \frac{1}{13}(5, -12) = \frac{1}{65}(39 + 25,\ 52 - 60) = \frac{8}{65}(8, -1).$$
Нормаль биссектрисы — $\vec n_3 = (1, 8)$, уравнение через $A(1, 2)$: $(x - 1) + 8(y - 2) = 0 \Leftrightarrow x + 8y - 17 = 0$.

*Ответ:* медиана $x + y - 3 = 0$, высота $x - 8y + 15 = 0$, биссектриса $x + 8y - 17 = 0$.
:::

::: {.problem #prob:exam1:pencil}
Составьте уравнение плоскости, проходящей через линию пересечения плоскостей $x + 2y - z - 3 = 0$ и $2x - y + 3z - 1 = 0$ и отсекающей на осях $Oy$ и $Oz$ равные ненулевые отрезки.
:::

::: solution
У второй плоскости коэффициенты при $y$ и $z$ равны $-1$ и $3$, они не совпадают, значит, она сама условию не удовлетворяет и искомую плоскость можно искать в пучке с одним параметром $\lambda$:
$$(x + 2y - z - 3) + \lambda(2x - y + 3z - 1) = 0,$$
$$(1 + 2\lambda)x + (2 - \lambda)y + (-1 + 3\lambda)z + (-3 - \lambda) = 0.$$
Равенство ненулевых отрезков на $Oy$ и $Oz$ ($-\frac DB = -\frac DC \ne 0$) равносильно $B = C \ne 0$ и $D \ne 0$. Решаем $2 - \lambda = -1 + 3\lambda \Rightarrow 4\lambda = 3 \Rightarrow \lambda = \frac34$. При $\lambda = \frac34$:
$$\frac52 x + \frac54 y + \frac54 z - \frac{15}{4} = 0 \;\Leftrightarrow\; 2x + y + z - 3 = 0.$$
Проверка: $B = C = 1 \ne 0$, $D = -3 \ne 0$, отрезки на $Oy$ и $Oz$ равны $3$; уравнение является линейной комбинацией исходных ($4(F_1 + \frac34 F_2) = 5(2x + y + z - 3)$).

*Ответ:* $2x + y + z - 3 = 0$.
:::

Ещё задачи: [-@prob:lec14:triangle-lines], [-@prob:lec14:pencil], [-@prob:lec14:coplanar-lines].

## 8. Взаимное расположение прямых и плоскостей {#sec:exam1:positions}

1. Для двух прямых $\ell_1(M_1, \vec s_1)$ и $\ell_2(M_2, \vec s_2)$ вычислите $[\vec s_1, \vec s_2]$ и смешанное произведение $\Delta = \langle \overrightarrow{M_1 M_2}, \vec s_1, \vec s_2 \rangle$ (теорема [-@thm:lec14:two-lines]).
2. Если $\Delta \ne 0$ — прямые скрещиваются; расстояние между ними равно $\rho(\ell_1, \ell_2) = \frac{|\Delta|}{|[\vec s_1, \vec s_2]|}$.
3. Если $\Delta = 0$ и $[\vec s_1, \vec s_2] \ne \vec 0$ — прямые пересекаются в единственной точке: запишите обе прямые параметрически (с *разными* параметрами $t$ и $u$), приравняйте координаты, найдите $t, u$ из двух уравнений и проверьте третье. Плоскость, содержащая обе прямые, проходит через $M_1$ с нормалью $\vec n = [\vec s_1, \vec s_2]$.
4. Если $[\vec s_1, \vec s_2] = \vec 0$ — прямые параллельны ($M_1 \notin \ell_2$) или совпадают ($M_1 \in \ell_2$).
5. Для прямой и плоскости: подставьте параметрические уравнения прямой в уравнение плоскости (теорема [-@thm:lec14:line-plane]).

::: {.problem #prob:exam1:two-lines}
Проверьте, что прямые $\ell_1\colon \dfrac{x - 1}{2} = \dfrac{y + 1}{1} = \dfrac{z - 2}{-1}$ и $\ell_2\colon x = 2 + u,\ y = -2 + 2u,\ z = 4 - 3u$ пересекаются, найдите точку их пересечения и уравнение плоскости, в которой они лежат.
:::

::: solution
Считываем точки и направляющие векторы: $M_1(1, -1, 2)$, $\vec s_1 = (2, 1, -1)$; $M_2(2, -2, 4)$, $\vec s_2 = (1, 2, -3)$. Вектор $\overrightarrow{M_1 M_2} = (1, -1, 2)$.

Векторное произведение:
$$\vec n = [\vec s_1, \vec s_2] = \begin{vmatrix} \vec i & \vec j & \vec k \\ 2 & 1 & -1 \\ 1 & 2 & -3 \end{vmatrix} = (-1, 5, 3) \ne \vec 0.$$
Смешанное произведение: $\langle \overrightarrow{M_1 M_2}, \vec s_1, \vec s_2 \rangle = (\overrightarrow{M_1 M_2}, \vec n) = 1(-1) + (-1)\cdot 5 + 2\cdot 3 = 0$. По теореме [-@thm:lec14:two-lines] прямые пересекаются.

Запишем $\ell_1$ параметрически: $x = 1 + 2t$, $y = -1 + t$, $z = 2 - t$. Приравниваем к $\ell_2$:
$$\begin{cases} 1 + 2t = 2 + u, \\ -1 + t = -2 + 2u, \\ 2 - t = 4 - 3u. \end{cases}$$
Из первого $u = 2t - 1$; во второе: $-1 + t = -2 + 4t - 2 \Rightarrow 3t = 3 \Rightarrow t = 1$, $u = 1$. Проверка третьего: $2 - 1 = 1 = 4 - 3$. Точка пересечения $P = (3, 0, 1)$.

Плоскость через $M_1(1, -1, 2)$ с нормалью $-\vec n = (1, -5, -3)$: $1(x - 1) - 5(y + 1) - 3(z - 2) = 0 \Leftrightarrow x - 5y - 3z = 0$. Проверка: $M_2(2, -2, 4)$ даёт $2 + 10 - 12 = 0$, $P(3, 0, 1)$ даёт $3 - 0 - 3 = 0$.

*Ответ:* пересекаются в точке $(3, 0, 1)$; плоскость $x - 5y - 3z = 0$.
:::

::: {.problem #prob:exam1:lines-skew}
Установите взаимное расположение прямых $\ell_1\colon \dfrac{x}{1} = \dfrac{y - 1}{-2} = \dfrac{z + 1}{2}$ и $\ell_2\colon x = -2 + 2u,\ y = 1 + 2u,\ z = u$ и найдите расстояние между ними.
:::

::: solution
Имеем $M_1(0, 1, -1)$, $\vec s_1 = (1, -2, 2)$ и $M_2(-2, 1, 0)$, $\vec s_2 = (2, 2, 1)$; $\overrightarrow{M_1 M_2} = (-2, 0, 1)$. Вычислим
$$[\vec s_1, \vec s_2] = \begin{vmatrix} \vec i & \vec j & \vec k \\ 1 & -2 & 2 \\ 2 & 2 & 1 \end{vmatrix} = (-6, 3, 6), \qquad |[\vec s_1, \vec s_2]| = \sqrt{36 + 9 + 36} = 9.$$
Смешанное произведение: $\langle \overrightarrow{M_1 M_2}, \vec s_1, \vec s_2 \rangle = (-2)(-6) + 0\cdot 3 + 1\cdot 6 = 18 \ne 0$. По теореме [-@thm:lec14:two-lines] прямые скрещиваются. Расстояние равно высоте параллелепипеда на $\overrightarrow{M_1 M_2}, \vec s_1, \vec s_2$ (отношению объёма к площади основания):
$$\rho(\ell_1, \ell_2) = \frac{|\langle \overrightarrow{M_1 M_2}, \vec s_1, \vec s_2 \rangle|}{|[\vec s_1, \vec s_2]|} = \frac{18}{9} = 2.$$

*Ответ:* прямые скрещиваются, расстояние равно $2$.
:::

Ещё задачи: [-@prob:lec14:two-lines], [-@prob:lec14:line-plane], [-@prob:lec14:planes-ranks].

## 9. Проекция и симметричная точка {#sec:exam1:symmetry}

1. *Относительно плоскости $\pi\colon Ax + By + Cz + D = 0$:* проведите перпендикуляр через $M_0$ с направляющим вектором $\vec n = (A, B, C)$: $x = x_0 + At$, $y = y_0 + Bt$, $z = z_0 + Ct$.
2. Подставьте в уравнение $\pi$ и найдите $t$ — получите ортогональную проекцию $H$.
3. Симметричная точка $M'$ задаётся тем, что $H$ — середина $M_0 M'$: $M' = 2H - M_0$ (то есть параметр $2t$).
4. *Относительно прямой $\ell(M_1, \vec s)$:* проведите плоскость $\pi$ через $M_0$ перпендикулярно $\ell$ (нормаль $\vec n = \vec s$).
5. Найдите точку пересечения $H = \ell \cap \pi$ (подставив параметрические уравнения $\ell$ в $\pi$), затем $M' = 2H - M_0$.
6. Проверка: $H$ лежит на $\pi$ (или $\ell$) и $\overrightarrow{M_0 H}$ параллелен нормали плоскости (перпендикулярен $\vec s$).

::: {.problem #prob:exam1:sym-plane}
Найдите ортогональную проекцию и точку, симметричную точке $M_0(5, -1, 6)$ относительно плоскости $2x - y + 2z - 5 = 0$.
:::

::: solution
Нормаль плоскости $\vec n = (2, -1, 2)$. Перпендикуляр через $M_0$: $x = 5 + 2t$, $y = -1 - t$, $z = 6 + 2t$. Подставляем в уравнение плоскости:
$$2(5 + 2t) - (-1 - t) + 2(6 + 2t) - 5 = 0 \;\Rightarrow\; 18 + 9t = 0 \;\Rightarrow\; t = -2.$$
Проекция $H = (5 - 4,\ -1 + 2,\ 6 - 4) = (1, 1, 2)$. Проверка: $2\cdot 1 - 1 + 2\cdot 2 - 5 = 0$. Симметричная точка $M' = 2H - M_0 = (2 - 5,\ 2 - (-1),\ 4 - 6) = (-3, 3, -2)$.

*Ответ:* проекция $(1, 1, 2)$, симметричная точка $(-3, 3, -2)$.
:::

::: {.problem #prob:exam1:sym-line}
Найдите точку, симметричную точке $M_0(4, 2, 2)$ относительно прямой $\dfrac{x - 1}{1} = \dfrac{y + 1}{2} = \dfrac{z - 2}{-2}$.
:::

::: solution
Направляющий вектор прямой $\vec s = (1, 2, -2)$. Проведём через $M_0(4, 2, 2)$ плоскость $\pi \perp \vec s$:
$$1(x - 4) + 2(y - 2) - 2(z - 2) = 0 \;\Leftrightarrow\; x + 2y - 2z - 4 = 0.$$
Подставим параметрические уравнения прямой $x = 1 + t$, $y = -1 + 2t$, $z = 2 - 2t$ в уравнение $\pi$:
$$(1 + t) + 2(-1 + 2t) - 2(2 - 2t) - 4 = 0 \;\Rightarrow\; 9t - 9 = 0 \;\Rightarrow\; t = 1.$$
Проекция $H = (1 + 1,\ -1 + 2,\ 2 - 2) = (2, 1, 0)$. Проверка: $\overrightarrow{M_0 H} = (-2, -1, -2)$, $(\overrightarrow{M_0 H}, \vec s) = -2 - 2 + 4 = 0$. Симметричная точка $M' = 2H - M_0 = (4 - 4,\ 2 - 2,\ 0 - 2) = (0, 0, -2)$.

*Ответ:* $(0, 0, -2)$.
:::

Ещё задачи: [-@prob:lec14:projection], [-@prob:lec14:symmetric-line].

## 10. Группы, подгруппы, гомоморфизмы и порядок элемента {#sec:exam1:groups}

1. *Проверка подгруппы $H \le G$:* по критерию [-@thm:lec16:criterion] сначала покажите $H \ne \varnothing$ (обычно $e \in H$), затем для произвольных $h_1, h_2 \in H$ проверьте $h_1 h_2^{-1} \in H$.
2. *Проверка гомоморфизма $f\colon G_1 \to G_2$:* покажите, что $f(a * b) = f(a) \star f(b)$ для любых $a, b \in G_1$ (операции в $G_1$ и $G_2$ могут различаться).
3. *Порядок элемента:* в $(\Z_n, +)$ используйте $\operatorname{ord} \bar k = \frac{n}{\text{НОД}(k, n)}$ (утверждение [-@prop:lec17:zn-order]); порождающие $\Z_n$ — классы с $\text{НОД}(k, n) = 1$. В подстановках — НОК длин независимых циклов.
4. *Неизоморфность групп:* найдите инвариант изоморфизма, который различается — порядок группы, абелевость (утверждение [-@prop:lec16:invariants]) или число элементов данного порядка (утверждение [-@prop:lec17:iso-order]).

::: {.problem #prob:exam1:group-check}
Является ли множество $H = \left\{\begin{pmatrix} a & b \\ 0 & a^{-1} \end{pmatrix} \;\middle|\; a \in \R \setminus \{0\},\ b \in \R\right\}$ подгруппой в $GL_2(\R)$? Абелева ли $H$? Является ли отображение $f\colon H \to (\R \setminus \{0\}, \cdot)$, $f\!\begin{pmatrix} a & b \\ 0 & a^{-1} \end{pmatrix} = a$, гомоморфизмом?
:::

::: solution
Во-первых, $H \subseteq GL_2(\R)$, так как $\det \begin{pmatrix} a & b \\ 0 & a^{-1} \end{pmatrix} = a \cdot a^{-1} = 1 \ne 0$, и $H \ne \varnothing$, так как $E = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix} \in H$. Для $A = \begin{pmatrix} a & b \\ 0 & a^{-1} \end{pmatrix}$ и $B = \begin{pmatrix} c & d \\ 0 & c^{-1} \end{pmatrix}$ из $H$ обратная $B^{-1} = \begin{pmatrix} c^{-1} & -d \\ 0 & c \end{pmatrix}$, откуда
$$AB^{-1} = \begin{pmatrix} a & b \\ 0 & a^{-1} \end{pmatrix} \begin{pmatrix} c^{-1} & -d \\ 0 & c \end{pmatrix} = \begin{pmatrix} ac^{-1} & bc - ad \\ 0 & a^{-1}c \end{pmatrix} \in H,$$
так как $ac^{-1} \in \R \setminus \{0\}$ и $(ac^{-1})^{-1} = a^{-1}c$. По критерию [-@thm:lec16:criterion] $H \le GL_2(\R)$.

*Абелевость:* нет. Возьмём $A = \begin{pmatrix} 2 & 0 \\ 0 & \frac12 \end{pmatrix}$ и $B = \begin{pmatrix} 1 & 1 \\ 0 & 1 \end{pmatrix}$ из $H$: $AB = \begin{pmatrix} 2 & 2 \\ 0 & \frac12 \end{pmatrix}$, а $BA = \begin{pmatrix} 2 & \frac12 \\ 0 & \frac12 \end{pmatrix} \ne AB$.

*Гомоморфизм:* для $A, B \in H$ имеем $AB = \begin{pmatrix} ac & ad + bc^{-1} \\ 0 & (ac)^{-1} \end{pmatrix}$, поэтому $f(AB) = ac = f(A)f(B)$ — гомоморфизм.

*Ответ:* да, $H \le GL_2(\R)$; не абелева; да, $f$ — гомоморфизм.
:::

::: {.problem #prob:exam1:group-orders}
\(a) Найдите порядки элементов $\bar 3$, $\bar 4$, $\bar 5$, $\bar 6$ и перечислите все порождающие группы $(\Z_{12}, +)$. (b) Изоморфны ли группы $(\Z_4, +)$ и $(\Z_8^*, \cdot)$, где $\Z_8^* = \{\bar 1, \bar 3, \bar 5, \bar 7\}$ с умножением по модулю $8$?
:::

::: solution
\(a) По утверждению [-@prop:lec17:zn-order] $\operatorname{ord} \bar k = \frac{12}{\text{НОД}(k, 12)}$: $\operatorname{ord} \bar 3 = \frac{12}{3} = 4$, $\operatorname{ord} \bar 4 = \frac{12}{4} = 3$, $\operatorname{ord} \bar 5 = \frac{12}{1} = 12$, $\operatorname{ord} \bar 6 = \frac{12}{6} = 2$. Порождающие — элементы порядка $12$, то есть $\bar k$ с $\text{НОД}(k, 12) = 1$: $\bar 1, \bar 5, \bar 7, \overline{11}$.

\(b) Обе группы абелевы и имеют порядок $4$, поэтому этих инвариантов недостаточно. *Ключ:* сравнить порядки элементов (утверждение [-@prop:lec17:iso-order]). В $(\Z_4, +)$ элемент $\bar 1$ имеет порядок $4$. В $(\Z_8^*, \cdot)$ квадрат каждого элемента равен $\bar 1$: $1^2 = 1$, $3^2 = 9 \equiv 1$, $5^2 = 25 \equiv 1$, $7^2 = 49 \equiv 1 \pmod 8$, поэтому все неединичные элементы имеют порядок $2$, элемента порядка $4$ нет. Изоморфизм сохраняет порядки, значит, группы не изоморфны.

*Ответ:* (a) $4$, $3$, $12$, $2$; порождающие $\bar 1, \bar 5, \bar 7, \overline{11}$; (b) нет.
:::

Ещё задачи: [-@prob:lec16:i-group].

# Генератор билетов {#sec:exam1:generator}

```{=latex}
Генератор случайных тренировочных билетов, с ответами,~--- на сайте: \url{https://hse.nalinor.dev/algebra/exam1}.
```
