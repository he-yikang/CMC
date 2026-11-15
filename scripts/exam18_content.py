# -*- coding: utf-8 -*-
"""第 18 届初赛 A/B 类：按扫描件《第十八届全国大学生数学竞赛初赛试卷参考答案》
（非数学 A 类 / B 类，2026 年）逐页逐字转录的**完整内容**。

与其余 42 套一致：题目版只放题目全文，参考解答版只放解答全文（含每一步推导、
每一步给分点标记、每个结论），不做要点压缩、不用「同 A 卷」替代。

公式用 KaTeX 语法（$...$），由 build_exam18.py 排版；transcript() 会把同一份内容
压成纯文本供 build_data.py 生成 stem / solution，供检索、考点与卡片自动标注使用。
"""

import re

CN = ["一", "二", "三", "四", "五", "六"]
POINTS = [30, 14, 14, 14, 14, 14]

# ---------------------------------------------------------------- A 卷共用块
# 微分方程（A 卷第三题 / B 卷第四题，原卷两题完全相同）与
# 有界二阶可导函数（A 卷第五题 / B 卷第六题，原卷两题完全相同）。
# 两处都完整写出，不做「参见 A 卷」式的省略。
_ODE_ITEMS = [
    r"求解微分方程 $x^{2}y'+xy=y^{2}\ln x,\quad x>0.$",
]

_ODE_SOLUTION = [
    r"解答. 显然 $y=0$ 为方程的一个特解。……（2 分）",
    r"当 $y\ne0$ 时，方程两边同除以 $x^{2}y^{2}$，得",
    r"$\dfrac{y'}{y^{2}}+\dfrac1x\cdot\dfrac1y=\dfrac{\ln x}{x^{2}}.$",
    r"作变量代换 $u=y^{-1}$，则上述方程化为",
    r"$u'-\dfrac1x u=-\dfrac{\ln x}{x^{2}}.$　……（6 分）",
    r"这是关于未知函数 $u$ 的一阶线性方程。利用通解公式，得",
    r"$u=e^{\int\frac1x\,dx}\left(-\int\dfrac{\ln x}{x^{2}}e^{-\int\frac1x\,dx}\,dx+C\right)$",
    r"$=x\left(-\int\dfrac{\ln x}{x^{3}}\,dx+C\right)$",
    r"$=x\left(\dfrac{\ln x}{2x^{2}}-\dfrac12\int\dfrac1{x^{3}}\,dx+C\right)$",
    r"$=x\left(\dfrac{2\ln x+1}{4x^{2}}+C\right)$　……（11 分）",
    r"代回变量 $y$，得原方程的通解为",
    r"$y=\dfrac{1}{Cx+\dfrac{2\ln x+1}{4x}},\quad x>0,$",
    r"其中 $C$ 是使得上述表达式有意义的任意常数。……（14 分）",
]

_BOUNDED_ITEMS = [
    r"设 $f(x)$ 在 $\mathbb{R}$ 上有界且二阶连续可导。",
    r"（1）证明：存在 $\xi\in\mathbb{R}$，使得 $f''(\xi)=0$。",
    r"（2）若 $f'(x)$ 在 $\mathbb{R}$ 上无界，证明：存在 $\xi\in\mathbb{R}$，使得 $f(\xi)+f''(\xi)=0$。",
]

_BOUNDED_SOLUTION = [
    r"解答. (1) 反证法。假设不存在这样的 $\xi$，则 $f''(x)$ 在 $\mathbb{R}$ 上定号，无妨设 $f''(x)>0,$",
    r"则 $f'(x)$ 严格单调增加，故存在 $\eta\in\mathbb{R}$ 使得 $f'(\eta)\ne0.$",
    r"若 $f'(\eta)>0$，当 $x>\eta$ 时，$f(x)>f(\eta)+f'(\eta)(x-\eta);$",
    r"若 $f'(\eta)<0$，当 $x<\eta$ 时，$f(x)<f(\eta)+f'(\eta)(x-\eta);$",
    r"这两种情况均与 $f(x)$ 有界矛盾。……（4 分）",
    r"(2) 令 $F(x)=f^{2}(x)+f'^{2}(x)$，则 $F'(x)=2f'(x)\bigl(f(x)+f''(x)\bigr).$　…（6 分）",
    r"由题设条件，存在 $M>0$ 使得 $|f(x)|\le M,\ \forall x\in\mathbb{R}$。由 $f'(x)$ 无界知存在 $x_{1}$ 使得 $|f'(x_{1})|>M+1$，故 $F(x_{1})>(1+M)^{2}.$",
    r"由 $f'(x)$ 无界知存在 $x_{2}$ 使得 $F(x_{2})\ge f'^{2}(x_{2})>F(x_{1})$。无妨设 $x_{2}>x_{1}.$",
    r"任取 $\alpha\ge x_{2}$，$F(x)$ 在区间 $[x_{1},\alpha]$ 上必有最大值。",
    r"首先断言存在 $\alpha$ 使得最大值在区间内部取到，否则若对于任意的 $\alpha$ 使得最大值在端点取到，由于 $F(x_{2})>F(x_{1})$，$x_{1}$ 不是最大值点，故 $\alpha$ 是最大值点，由 $\alpha$ 的任意性，$F(x)$ 在 $[x_{2},+\infty)$ 上单调递增。",
    r"在 $[x_{2},+\infty)$ 上，$f^{2}(x)+M^{2}\ge F(x)\ge F(x_{1})>(1+M)^{2}$，$|f'(x)|>1$，$|f(x)-f(x_{2})|\ge x-x_{2}$，与 $f(x)$ 有界矛盾。断言证毕。",
    r"由断言，存在 $\alpha$ 使得最大值在区间内部取到，即存在 $\xi\in(x_{1},\alpha)$ 使得 $F(\xi)$ 取得最大值，故 $F'(\xi)=2f'(\xi)\bigl(f(\xi)+f''(\xi)\bigr)=0.$",
    r"最后，$M^{2}+f'^{2}(\xi)\ge F(\xi)\ge F(x_{1})>(1+M)^{2}$，$f'(\xi)\ne0$，$f(\xi)+f''(\xi)=0.$　……（14 分）",
]


EXAMS = {
    "18A初": {
        "group": "非数学A 类",
        "sheet": "第十八届全国大学生数学竞赛初赛试卷参考答案（非数学 A 类，2026 年）",
        "questions": [
            {
                "n": 1,
                "title": "填空题（本题满分 30 分，每小题 6 分）",
                "items": [
                    r"（1）极限 $\lim\limits_{x\to0}\left(\dfrac{1}{x\sin x}-\dfrac{1}{x^{2}}\right)=$ ________.",
                    r"（2）若函数 $f(x)=\begin{cases}e^{x}(\sin x+\cos x),&x\ge0\\ abx^{2}+ax+2a+b,&x<0\end{cases}$ 的导函数在 $\mathbb{R}$ 上连续，则 $3a+2b=$ ________.",
                    r"（3）点 $(2024,2025,2026)$ 关于直线 $\begin{cases}2x+y-6076=0\\ y+2z-6080=0\end{cases}$ 的对称点为 ________.",
                    r"（4）设 $f(x,y)$ 具有连续偏导数，$f(1,1)=1,\ f'_x(1,1)=1,\ f'_y(1,1)=2$。若 $\varphi(x)=f(x,f(x,x))$，则 $\varphi'(1)=$ ________.",
                    r"（5）极限 $\lim\limits_{n\to\infty}\dfrac1n\left(\sqrt{1+\sin\dfrac{\pi}{3n}}+\sqrt{1+\sin\dfrac{2\pi}{3n}}+\cdots+\sqrt{1+\sin\dfrac{3n\pi}{3n}}\right)=$ ________.",
                ],
                "solution": [
                    r"解答. (1) 用泰勒公式易得极限为 $\dfrac16.$",
                    r"(2) 由函数 $f$ 在 $0$ 点连续，可得 $2a+b=1$，由导函数在 $0$ 点连续，可得 $a=2$，由此可得 $b=-3$，所以 $3a+2b=0.$",
                    r"(3) 直线的方向向量为",
                    r"$\boldsymbol{s}=\boldsymbol{n}_{1}\times\boldsymbol{n}_{2}=(2,1,0)\times(0,1,2)=(2,-4,2).$",
                    r"过已知点且垂直于该直线的平面方程为",
                    r"$x-2y+z=0.$",
                    r"此平面与直线的交点（垂足）坐标为",
                    r"$(2025,2026,2027).$",
                    r"由对称性，故对称点坐标为",
                    r"$(2026,2027,2028).$",
                    r"(4)",
                    r"$\varphi'(x)=\dfrac{d}{dx}f(x,f(x,x))=f'_x+f'_y\bigl[f'_x(x,x)+f'_y(x,x)\bigr],$",
                    r"$\varphi'(1)=f'_x(1,f(1,1))+f'_y(1,f(1,1))\bigl[f'_x(1,1)+f'_y(1,1)\bigr]$",
                    r"$=1+2(1+2)=7.$",
                    r"(5) 对于自然数 $k$，",
                    r"$1+\sin\dfrac{k\pi}{3n}=1+2\sin\dfrac{k\pi}{6n}\cos\dfrac{k\pi}{6n}=\left(\sin\dfrac{k\pi}{6n}+\cos\dfrac{k\pi}{6n}\right)^{2};$",
                    r"所以",
                    r"$\lim\limits_{n\to\infty}\dfrac1n\left(\sqrt{1+\sin\dfrac{\pi}{3n}}+\sqrt{1+\sin\dfrac{2\pi}{3n}}+\cdots+\sqrt{1+\sin\dfrac{3n\pi}{3n}}\right)$",
                    r"$=3\lim\limits_{n\to\infty}\dfrac{1}{3n}\left(\sin\dfrac{\pi}{6n}+\cos\dfrac{\pi}{6n}+\sin\dfrac{2\pi}{6n}+\cos\dfrac{2\pi}{6n}+\cdots+\sin\dfrac{3n\pi}{6n}+\cos\dfrac{3n\pi}{6n}\right)$",
                    r"$=3\lim\limits_{n\to\infty}\dfrac{1}{3n}\left(\sum\limits_{k=1}^{3n}\sin\dfrac{k\pi}{6n}+\sum\limits_{k=1}^{3n}\cos\dfrac{k\pi}{6n}\right)$",
                    r"$=3\displaystyle\int_{0}^{1}\sin\dfrac{\pi x}{2}\,dx+3\int_{0}^{1}\cos\dfrac{\pi x}{2}\,dx=\dfrac{12}{\pi}.$",
                ],
                "topics": ["M1-06", "M2-06", "M4-04", "M3-03", "M7-05"],
            },
            {
                "n": 2,
                "title": "（本题满分 14 分）",
                "items": [
                    r"设函数 $f(x,y)$ 在点 $(0,0)$ 的某个邻域内连续，且 $\lim\limits_{(x,y)\to(0,0)}\dfrac{f(x,y)-xy}{x^{2}+y^{2}}=c.$",
                    r"（1）若 $c>\dfrac12$，$f(0,0)$ 是否为 $f(x,y)$ 的极值？证明你的结论。",
                    r"（2）若 $c=\dfrac12$，则（1）中的结论还成立吗？若成立给出证明，若不成立举出反例。",
                ],
                "solution": [
                    r"解答. (1) 由题设，$f(0,0)=0$。若 $c>\dfrac12$，由保号性知在原点的小邻域内，",
                    r"$\dfrac{f(x,y)-xy}{x^{2}+y^{2}}\ge\dfrac{c+\frac12}{2}.$",
                    r"$f(x,y)\ge\dfrac12\left(c+\dfrac12\right)(x^{2}+y^{2})+xy\ge0=f(0,0).$",
                    r"故 $f(0,0)$ 是为 $f(x,y)$ 的极小值。……（8 分）",
                    r"(2) 若 $c=\dfrac12$，(1) 中的结论不再成立。如取",
                    r"$f(x,y)=xy+\dfrac12(x^{2}+y^{2})-y^{3},$",
                    r"则 $f$ 满足条件但 $f(x,-x)=x^{3}$，显然 $f(0,0)$ 不是极值。……（14 分）",
                ],
                "topics": ["M4-08", "M4-02", "M9-01"],
            },
            {
                "n": 3,
                "title": "（本题满分 14 分）",
                "items": list(_ODE_ITEMS),
                "solution": list(_ODE_SOLUTION),
                "topics": ["M6-03", "M6-02", "M6-04"],
            },
            {
                "n": 4,
                "title": "（本题满分 14 分）",
                "items": [
                    r"已知半径为 $r\ (0<r<2a)$ 的球，其球心在半径为常数 $a$ 的球面上。",
                    r"（1）求半径为 $a$ 的球截得半径为 $r$ 的球的部分球面面积 $S(r)$。",
                    r"（2）当 $S(r)$ 最大时，求两球公共部分的体积。",
                ],
                "solution": [
                    r"解答. (1) 不妨设两球面方程分别为",
                    r"$x^{2}+y^{2}+z^{2}=a^{2},\qquad x^{2}+y^{2}+(z-a)^{2}=r^{2}.$",
                    r"交线所在平面为",
                    r"$z=\dfrac{2a^{2}-r^{2}}{2a}.$",
                    r"投影区域为",
                    r"$D_{xy}:x^{2}+y^{2}\le\dfrac{r^{2}}{4a^{2}}(4a^{2}-r^{2})\triangleq R_{0}^{2}.$",
                    r"球面方程为",
                    r"$z=a-\sqrt{r^{2}-x^{2}-y^{2}},$",
                    r"且 $\dfrac{\partial z}{\partial x}=\dfrac{x}{\sqrt{r^{2}-x^{2}-y^{2}}},\quad\dfrac{\partial z}{\partial y}=\dfrac{y}{\sqrt{r^{2}-x^{2}-y^{2}}},$",
                    r"于是面积微元",
                    r"$\sqrt{1+\left(\dfrac{\partial z}{\partial x}\right)^{2}+\left(\dfrac{\partial z}{\partial y}\right)^{2}}\,dxdy=\dfrac{r}{\sqrt{r^{2}-x^{2}-y^{2}}}\,dxdy.$",
                    r"因此，所截球面面积为",
                    r"$S(r)=\displaystyle\iint_{D_{xy}}\dfrac{r}{\sqrt{r^{2}-x^{2}-y^{2}}}\,dxdy=\int_{0}^{2\pi}d\theta\int_{0}^{R_{0}}\dfrac{r}{\sqrt{r^{2}-\rho^{2}}}\rho\,d\rho$",
                    r"$=2\pi r\left[-\sqrt{r^{2}-\rho^{2}}\right]_{0}^{R_{0}}=2\pi r\left(r-\sqrt{r^{2}-R_{0}^{2}}\right).$",
                    r"由 $R_{0}^{2}=\dfrac{r^{2}}{4a^{2}}(4a^{2}-r^{2})$ 得",
                    r"$\sqrt{r^{2}-R_{0}^{2}}=\sqrt{r^{2}-\dfrac{r^{2}(4a^{2}-r^{2})}{4a^{2}}}=\dfrac{r^{2}}{2a},$",
                    r"故",
                    r"$S(r)=2\pi r^{2}-\dfrac{\pi r^{3}}{a}\quad(0<r<2a).$",
                    r"(2)",
                    r"$S'(r)=4\pi r-\dfrac{3\pi r^{2}}{a}.$",
                    r"由 $S'(r)=0$ 得 $r=0$（舍），$r=\dfrac{4a}{3}$，而",
                    r"$\left.S''(r)\right|_{r=\frac{4a}{3}}=-4\pi<0,$",
                    r"所以当 $r=\dfrac{4a}{3}$ 时，所截球面面积 $S(r)$ 最大。",
                    r"此时体积为",
                    r"$V=\displaystyle\int_{0}^{2\pi}d\theta\int_{0}^{\frac{\sqrt{80}}{9}a}\left(\sqrt{a^{2}-\rho^{2}}+\sqrt{\tfrac{16}{9}a^{2}-\rho^{2}}-a\right)\rho\,d\rho=\dfrac{64}{81}\pi a^{3}.$",
                    r"……（14 分）",
                ],
                "topics": ["M5-04", "M5-06", "M7-06", "M3-07"],
            },
            {
                "n": 5,
                "title": "（本题满分 14 分）",
                "items": list(_BOUNDED_ITEMS),
                "solution": list(_BOUNDED_SOLUTION),
                "topics": ["M2-05", "M2-01", "M1-09"],
            },
            {
                "n": 6,
                "title": "（本题满分 14 分）",
                "items": [
                    r"考虑幂级数 $\sum\limits_{n=1}^{\infty}\dfrac1{n^{p}}x^{n}$，其中 $p\in(0,1)$。",
                    r"（1）求该幂级数的收敛域。",
                    r"（2）设该幂级数的和函数为 $f(x)$，求由 $f^{2}(x)$ 得到的幂级数的收敛域。",
                ],
                "solution": [
                    r"解答. (1) 易知收敛域为 $[-1,1).$　……（2 分）",
                    r"(2) $f^{2}(x)$ 的幂级数表达式为",
                    r"$\sum\limits_{n=2}^{\infty}c_{n}x^{n},\qquad c_{n}=\sum\limits_{i=1}^{n-1}\dfrac1{(i(n-i))^{p}}.$",
                    r"不难得到此级数在 $(-1,1)$ 上收敛，在 $x=1$ 处发散。……（4 分）",
                    r"下面讨论 $x=-1$ 处的收敛性，即 $\sum\limits_{n=2}^{\infty}(-1)^{n}c_{n}$ 的收敛性。",
                    r"情形 1. $0<p\le\dfrac12$，注意，$i(n-i)\le\dfrac{n^{2}}2$，故",
                    r"$c_{n}\ge\sum\limits_{i=1}^{n-1}\dfrac{2^{p}}{n^{2p}}=\dfrac{2^{p}(n-1)}{n^{2p}}\ge\dfrac{2^{p}n}{2n^{2p}}=2^{p-1}n^{1-2p}.$",
                    r"显然，$n\to\infty$ 时，$\{c_{n}\}$ 不收敛于 $0$，因此级数不收敛。……（8 分）",
                    r"情形 2. $1>p>\dfrac12$，注意有不等式 $(a+b)^{p}\le a^{p}+b^{p},\ \forall a,b>0$。于是",
                    r"$c_{n}=\dfrac1{n^{p}}\sum\limits_{i=1}^{n-1}\left(\dfrac1i+\dfrac1{n-i}\right)^{p}\le\dfrac2{n^{p}}\sum\limits_{i=1}^{n-1}\dfrac1{i^{p}}<\dfrac2{n^{p}}\left(1+\int_{1}^{n}\dfrac1{x^{p}}\,dx\right)<\dfrac2{n^{p}}\left(\dfrac{n^{1-p}}{1-p}+1\right)\le\dfrac{4}{(1-p)n^{2p-1}}.$",
                    r"于是当 $n\to\infty$ 时，$\{c_{n}\}$ 收敛于 $0$。故只需讨论级数 $c_{2}-\sum\limits_{k=1}^{\infty}(c_{2k+1}-c_{2k+2})$ 的收敛性。",
                    r"$c_{2k+1}=\sum\limits_{i=1}^{2k}\dfrac1{(i(2k+1-i))^{p}}=\sum\limits_{i=1}^{k}\dfrac2{(i(2k+1-i))^{p}},$",
                    r"$c_{2k+2}=\sum\limits_{i=1}^{k}\dfrac2{(i(2k+2-i))^{p}}+\dfrac1{(k+1)^{2p}}.$",
                    r"故 $c_{2k+1}-c_{2k+2}=d_{k}+e_{k}$，其中",
                    r"$d_{k}=\sum\limits_{i=1}^{k}\dfrac2{i^{p}}\left(\dfrac1{(2k+1-i)^{p}}-\dfrac1{(2k+2-i)^{p}}\right),\qquad e_{k}=-\dfrac1{(k+1)^{2p}}.$",
                    r"记 $h(x)=\dfrac1{x^{p}}$，则 $x>0$ 时，$h(x)-h(x+1)=\int_{x}^{x+1}-h'(t)\,dt<\dfrac{p}{x^{p+1}}$。于是，",
                    r"$0<d_{k}<\sum\limits_{i=1}^{k}\dfrac2{i^{p}}\cdot\dfrac{p}{(2k+1-i)^{p+1}}<\dfrac{p}{k+1}\sum\limits_{i=1}^{k}\dfrac2{(i(2k+1-i))^{p}}=\dfrac{p}{k+1}c_{2k+1}.$",
                    r"由于",
                    r"$c_{2k+1}\le\dfrac{4}{(1-p)(2k+1)^{2p-1}},$",
                    r"所以 $\sum d_{k}$ 收敛，同时 $\sum e_{k}$ 显然收敛，于是级数 $c_{2}-\sum\limits_{k=1}^{\infty}(c_{2k+1}-c_{2k+2})$ 收敛。",
                    r"综上，$0<p\le\dfrac12$ 时，该幂级数的收敛域为 $(-1,1)$；$p>\dfrac12$ 时，该幂级数的收敛域为 $[-1,1).$",
                    r"……（14 分）",
                ],
                "topics": ["M8-05", "M8-03", "M8-04", "M9-01"],
            },
        ],
    },

    "18B初": {
        "group": "非数学B 类",
        "sheet": "第十八届全国大学生数学竞赛初赛试卷参考答案（非数学 B 类，2026 年）",
        "questions": [
            {
                "n": 1,
                "title": "填空题（本题满分 30 分，每小题 6 分）",
                "items": [
                    r"（1）极限 $\lim\limits_{x\to0}\left[\dfrac1{\ln(1+x)}-\dfrac1x\right]=$ ________.",
                    r"（2）若函数 $f(x)=\begin{cases}e^{x}(\sin x+\cos x),&x\ge0\\ abx^{2}+ax+2a+b,&x<0\end{cases}$ 的导函数在 $\mathbb{R}$ 上连续，则 $3a+2b=$ ________.",
                    r"（3）点 $(2024,2025,2026)$ 关于平面 $x+y+z=6078$ 的对称点为 ________.",
                    r"（4）计算二重积分 $\displaystyle\int_{0}^{1}dx\int_{x}^{1}\cos y^{2}\,dy=$ ________.",
                    r"（5）设 $f(x,y)$ 具有连续偏导数，$f(1,1)=1,\ f'_x(1,1)=1,\ f'_y(1,1)=2$。若 $\varphi(x)=f(x,f(x,x))$，则 $\varphi'(1)=$ ________.",
                ],
                "solution": [
                    r"解答. (1)",
                    r"$\lim\limits_{x\to0}\left[\dfrac1{\ln(1+x)}-\dfrac1x\right]=\lim\limits_{x\to0}\left[\dfrac{x-\ln(1+x)}{x\ln(1+x)}\right]=\lim\limits_{x\to0}\left[\dfrac{x-\left(x-\frac12x^{2}+o(x^{2})\right)}{x^{2}}\right]=\dfrac12.$",
                    r"(2) 由函数 $f$ 在 $0$ 点连续，可得 $2a+b=1$，由导函数在 $0$ 点连续，可得 $a=2$，由此可得 $b=-3$，所以 $3a+2b=0.$",
                    r"(3) 由题意可知，过点 $(2024,2025,2026)$ 且与已知平面垂直的直线方程为",
                    r"$\dfrac{x-2024}{1}=\dfrac{y-2025}{1}=\dfrac{z-2026}{1},$",
                    r"设",
                    r"$\dfrac{x-2024}{1}=\dfrac{y-2025}{1}=\dfrac{z-2026}{1}=t,$",
                    r"将其代入平面方程得 $t=1$，从而得交点坐标为 $(2025,2026,2027)$，由对称性可知，所求对称点坐标为 $(2026,2027,2028).$",
                    r"(4) 交换积分顺序",
                    r"$\displaystyle\int_{0}^{1}dx\int_{x}^{1}\cos(y^{2})\,dy=\int_{0}^{1}dy\int_{0}^{y}\cos(y^{2})\,dx=\int_{0}^{1}y\cos(y^{2})\,dy$",
                    r"$=\dfrac12\displaystyle\int_{0}^{1}\cos(y^{2})\,d(y^{2})=\dfrac12\sin1.$",
                    r"(5)",
                    r"$\varphi'(x)=\dfrac{d}{dx}f(x,f(x,x))=f'_x+f'_y\bigl[f'_x(x,x)+f'_y(x,x)\bigr],$",
                    r"$\varphi'(1)=f'_x(1,f(1,1))+f'_y(1,f(1,1))\bigl[f'_x(1,1)+f'_y(1,1)\bigr]$",
                    r"$=1+2(1+2)=7.$",
                ],
                "topics": ["M1-06", "M1-07", "M7-05", "M5-01", "M4-04"],
            },
            {
                "n": 2,
                "title": "（本题满分 14 分）",
                "items": [
                    r"设 $f(x)$ 在 $[0,+\infty)$ 上连续、非负，且满足 $\lim\limits_{x\to+\infty}f(x)\displaystyle\int_{0}^{x}f(t)\,dt=2$。求 $\lim\limits_{x\to+\infty}\sqrt{x}\,f(x)$。",
                ],
                "solution": [
                    r"解答. 记 $F(x)=\displaystyle\int_{0}^{x}f(t)\,dt$，则 $F(x)$ 单调递增、非负且 $F'(x)=f(x).$　……（2 分）",
                    r"由洛必达法则及题设条件，有",
                    r"$\lim\limits_{x\to+\infty}\dfrac{F^{2}(x)}{x}=2\lim\limits_{x\to+\infty}f(x)F(x)=4.$",
                    r"因而",
                    r"$\lim\limits_{x\to+\infty}\dfrac{F(x)}{\sqrt{x}}=2.$　……（8 分）",
                    r"故",
                    r"$\lim\limits_{x\to+\infty}\sqrt{x}\,f(x)=\lim\limits_{x\to+\infty}\dfrac{f(x)F(x)}{F(x)/\sqrt{x}}=1.$",
                    r"……（14 分）",
                ],
                "topics": ["M2-06", "M3-03", "M1-06"],
            },
            {
                "n": 3,
                "title": "（本题满分 14 分）",
                "items": [
                    r"设 $a>0$ 为常数，曲线 $L:y=\sqrt{x-a},\ x\ge a$。记曲线 $L$ 与它的过原点的切线及 $x$ 轴围成的平面图形为 $D$，求 $D$ 的面积及 $D$ 绕 $x$ 轴旋转一周所成旋转体的体积。",
                ],
                "solution": [
                    r"解答. 设切点为 $(x_{0},y_{0})$，则 $y_{0}=\sqrt{x_{0}-a}$，切线斜率为",
                    r"$k=\dfrac1{2\sqrt{x_{0}-a}}.$",
                    r"另一方面，切线过原点，故",
                    r"$k=\dfrac{y_{0}}{x_{0}}=\dfrac{\sqrt{x_{0}-a}}{x_{0}}.$",
                    r"于是",
                    r"$\dfrac1{2\sqrt{x_{0}-a}}=\dfrac{\sqrt{x_{0}-a}}{x_{0}}\Longrightarrow x_{0}=2(x_{0}-a)\Longrightarrow x_{0}=2a,\ y_{0}=\sqrt a.$",
                    r"故切线方程为",
                    r"$y=\dfrac1{2\sqrt a}x.$　……（4 分）",
                    r"所求平面图形的面积：",
                    r"$A=\displaystyle\int_{0}^{2a}\dfrac1{2\sqrt a}x\,dx-\int_{a}^{2a}\sqrt{x-a}\,dx$",
                    r"$=\left.\dfrac{x^{2}}{4\sqrt a}\right|_{0}^{2a}-\left.\dfrac23(x-a)^{3/2}\right|_{a}^{2a}=\dfrac13a^{3/2}.$　……（9 分）",
                    r"所求图形绕 $x$ 轴旋转一周所成旋转体的体积：",
                    r"$V=\pi\displaystyle\int_{0}^{2a}\left(\dfrac1{2\sqrt a}x\right)^{2}dx-\pi\int_{a}^{2a}\left(\sqrt{x-a}\right)^{2}dx$",
                    r"$=\pi\displaystyle\int_{0}^{2a}\dfrac{x^{2}}{4a}\,dx-\pi\int_{a}^{2a}(x-a)\,dx$",
                    r"$=\left.\pi\dfrac{x^{3}}{12a}\right|_{0}^{2a}-\left.\pi\dfrac{(x-a)^{2}}{2}\right|_{a}^{2a}=\dfrac{\pi a^{2}}{6}.$",
                    r"……（14 分）",
                ],
                "topics": ["M3-07", "M2-01", "M3-04"],
            },
            {
                "n": 4,
                "title": "（本题满分 14 分）",
                "items": list(_ODE_ITEMS),
                "solution": list(_ODE_SOLUTION),
                "topics": ["M6-03", "M6-02", "M6-04"],
            },
            {
                "n": 5,
                "title": "（本题满分 14 分）",
                "items": [
                    r"考虑幂级数 $\sum\limits_{n=1}^{\infty}\dfrac1n x^{n}.$",
                    r"（1）求此幂级数的收敛域。",
                    r"（2）设该幂级数的和函数为 $f(x)$，求 $f^{2}(x)$ 得到的幂级数的收敛域。",
                ],
                "solution": [
                    r"解答. (1) 易知此幂级数的收敛域为 $[-1,1).$　……（2 分）",
                    r"(2) 计算可知，$f^{2}(x)$ 对应的幂级数为",
                    r"$\sum\limits_{n=2}^{\infty}c_{n}x^{n},\qquad c_{n}=\sum\limits_{i=1}^{n-1}\dfrac1{i(n-i)}.$",
                    r"易得此幂级数 $(-1,1)$ 上收敛，在 $x=1$ 处发散。……（4 分）",
                    r"以下讨论 $x=-1$ 处的收敛性，即 $\sum\limits_{n=2}^{\infty}(-1)^{n}c_{n}$ 的收敛性。",
                    r"$c_{n}=\dfrac1n\sum\limits_{i=1}^{n-1}\dfrac{n}{i(n-i)}=\dfrac1n\sum\limits_{i=1}^{n-1}\left(\dfrac1i+\dfrac1{n-i}\right)=\dfrac2n\sum\limits_{i=1}^{n-1}\dfrac1i.$　……（8 分）",
                    r"一方面，",
                    r"$c_{n}\le\dfrac2n\sum\limits_{i=1}^{n-1}\left(1+\int_{i-1}^{i}\dfrac1x\,dx\right)\le\dfrac{2\bigl(1+\ln(n-1)\bigr)}{n}.$",
                    r"$\lim\limits_{n\to\infty}c_{n}=0.$　……（11 分）",
                    r"另一方面，",
                    r"$c_{n}-c_{n+1}=\dfrac2n\sum\limits_{i=1}^{n-1}\dfrac1i-\dfrac2{n+1}\sum\limits_{i=1}^{n}\dfrac1i$",
                    r"$=\left(\dfrac2n-\dfrac2{n+1}\right)\sum\limits_{i=1}^{n-1}\dfrac1i-\dfrac2{n+1}\cdot\dfrac1n$",
                    r"$=\dfrac2{n(n+1)}\sum\limits_{i=1}^{n-1}\dfrac1i-\dfrac2{n(n+1)}\ge0.$",
                    r"于是，$c_{n}$ 单调递减趋向于 $0$，级数收敛。",
                    r"综上，所求幂级数的收敛域为 $[-1,1).$　……（14 分）",
                ],
                "topics": ["M8-05", "M8-03", "M8-04", "M9-01"],
            },
            {
                "n": 6,
                "title": "（本题满分 14 分）",
                "items": list(_BOUNDED_ITEMS),
                "solution": list(_BOUNDED_SOLUTION),
                "topics": ["M2-05", "M2-01", "M1-09"],
            },
        ],
    },
}


# ---------------------------------------------------------------- 纯文本视图
# 站点里题干 / 解答以纯文本形式参与检索、考点与卡片匹配（与其余 42 套从 PDF
# 文本层抽取后「公式扁平化」的做法一致）。这里把同一份 KaTeX 内容转成可读文本。
_CMD = {
    "lim": "极限", "limits": "", "displaystyle": "", "sum": "∑", "int": "∫",
    "iint": "∬", "prod": "∏", "frac": "", "dfrac": "", "tfrac": "",
    "sqrt": "√", "partial": "∂", "infty": "∞", "to": "→", "Longrightarrow": "⇒",
    "sin": "sin", "cos": "cos", "ln": "ln", "pi": "π", "alpha": "α",
    "xi": "ξ", "eta": "η", "varphi": "φ", "rho": "ρ", "theta": "θ",
    "boldsymbol": "", "mathbb": "", "triangleq": "=", "qquad": " ", "quad": " ",
    "big": "", "bigl": "", "bigr": "", "left": "", "right": "",
    "begin": "", "end": "", "cases": "", "text": "",
    "ge": "≥", "le": "≤", "ne": "≠", "times": "×", "cdot": "·",
    "forall": "∀", "in": "∈", "circ": "°", "ne0": "≠0",
}


def _group(s, i):
    """读取 s[i] 起始的一对花括号（支持嵌套），返回 (内容, 结束下标)。"""
    if i >= len(s) or s[i] != "{":
        return None, i
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
    return None, i


def _fractions(s):
    """把 \frac{a}{b} 类还原成 (a)/(b)，分子分母可含嵌套花括号。"""
    out, i = [], 0
    while i < len(s):
        m = re.match(r"\\(?:dfrac|frac|tfrac)\s*\{", s[i:])
        if m:
            num, j = _group(s, i + m.end() - 1)
            if num is not None and j < len(s) and s[j] == "{":
                den, k = _group(s, j)
                if den is not None:
                    out.append("(%s)/(%s)" % (_fractions(num), _fractions(den)))
                    i = k
                    continue
        out.append(s[i])
        i += 1
    return "".join(out)


def transcript(s):
    """把一行 KaTeX 混排文字压成站点用的纯文本（中文与关键词原样保留）。"""
    s = s.replace("$", "")
    # 极限 / 求和 / 积分的上下限先折成括号，避免「极限_x→0」这种粘连
    s = re.sub(r"\\lim\\limits\s*_\{([^{}]*)\}", r"lim(\1)", s)
    s = re.sub(r"\\lim\s*_\{([^{}]*)\}", r"lim(\1)", s)
    s = re.sub(r"\\(sum|prod|int|iint)\\limits\s*_\{([^{}]*)\}\s*\^\{([^{}]*)\}",
               lambda m: {"sum": "∑", "prod": "∏", "int": "∫", "iint": "∬"}[m.group(1)]
               + "(%s..%s)" % (m.group(2), m.group(3)), s)
    s = re.sub(r"\\(sum|prod|int|iint)\\limits\s*_\{([^{}]*)\}",
               lambda m: {"sum": "∑", "prod": "∏", "int": "∫", "iint": "∬"}[m.group(1)]
               + "(%s)" % m.group(2), s)
    s = _fractions(s)
    s = re.sub(r"\\sqrt\s*\{([^{}]*)\}", r"√(\1)", s)
    s = s.replace("\\begin{cases}", "").replace("\\end{cases}", "")
    s = s.replace("\\\\", "；").replace("&", "，")   # cases 换行与列分隔
    s = re.sub(r"\\[a-zA-Z]+", lambda m: _CMD.get(m.group(0)[1:], " "), s)
    s = s.replace("\\,", " ").replace("\\;", " ").replace("\\!", "").replace("\\ ", " ")
    s = re.sub(r"[{}]", "", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def question_texts(code, n, kind):
    """返回该大题题目(stem)或解答(solution)的完整纯文本。"""
    q = next(x for x in EXAMS[code]["questions"] if x["n"] == n)
    lines = q["items"] if kind == "q" else q["solution"]
    return "\n".join(transcript(x) for x in lines if x.strip())
