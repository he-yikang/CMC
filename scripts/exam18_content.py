# -*- coding: utf-8 -*-
"""第 18 届初赛 A/B 类：按扫描件《试卷参考答案》人工转写的内容。

题目全文转录；解答按原卷步骤转写为要点（保留结论与关键公式）。
公式用 KaTeX 语法（$...$ / $$...$$），由 build_exam18.py 排版。
"""

CN = ["一", "二", "三", "四", "五", "六"]
POINTS = [30, 14, 14, 14, 14, 14]

EXAMS = {
    "18A初": {
        "group": "非数学A 类",
        "questions": [
            {
                "n": 1,
                "title": "填空题（本题 30 分，每小题 6 分）",
                "items": [
                    r"极限 $\lim\limits_{x\to 0}\left(\dfrac{1}{x\sin x}-\dfrac{1}{x^{2}}\right)=$ ________.",
                    r"若函数 $f(x)=\begin{cases}e^{x}(\sin x+\cos x),&x\ge 0\\ abx^{2}+ax+2a+b,&x<0\end{cases}$ 的导函数在 $\mathbb{R}$ 上连续，则 $3a+2b=$ ________.",
                    r"点 $(2024,2025,2026)$ 关于直线 $\begin{cases}2x+y-6076=0\\ y+2z-6080=0\end{cases}$ 的对称点为 ________.",
                    r"设 $f(x,y)$ 具有连续偏导数，$f(1,1)=1,\ f'_x(1,1)=1,\ f'_y(1,1)=2$。若 $\varphi(x)=f(x,f(x,x))$，则 $\varphi'(1)=$ ________.",
                    r"极限 $\lim\limits_{n\to\infty}\dfrac{1}{n}\left(\sqrt{1+\sin\dfrac{\pi}{3n}}+\sqrt{1+\sin\dfrac{2\pi}{3n}}+\cdots+\sqrt{1+\sin\dfrac{3n\pi}{3n}}\right)=$ ________.",
                ],
                "solution": [
                    r"（1）用泰勒公式 $\sin x=x-\dfrac{x^{3}}{6}+o(x^{3})$，得极限为 $\dfrac{1}{6}$。（2）由 $f$ 在 $0$ 点连续得 $2a+b=1$；由 $f'$ 在 $0$ 点连续得 $a=2$，故 $b=-3$，$3a+2b=0$。",
                    r"（3）直线方向向量 $\boldsymbol{s}=\boldsymbol{n}_{1}\times\boldsymbol{n}_{2}=(2,1,0)\times(0,1,2)=(2,-4,2)$。过已知点且垂直于该直线的平面为 $x-2y+z=0$，与直线交点（垂足）为 $(2025,2026,2027)$，故对称点为 $(2026,2027,2028)$。",
                    r"（4）$\varphi'(x)=f'_x(x,f(x,x))+f'_y(x,f(x,x))\bigl[f'_x(x,x)+f'_y(x,x)\bigr]$，故 $\varphi'(1)=1+2(1+2)=7$。",
                    r"（5）$1+\sin\dfrac{k\pi}{n}=\left(\sin\dfrac{k\pi}{2n}+\cos\dfrac{k\pi}{2n}\right)^{2}$，原式 $=3\lim\limits_{n\to\infty}\dfrac{1}{3n}\left(\sum\limits_{k=1}^{3n}\sin\dfrac{k\pi}{6n}+\sum\limits_{k=1}^{3n}\cos\dfrac{k\pi}{6n}\right)=3\displaystyle\int_{0}^{1}\sin\dfrac{\pi x}{2}\,dx+3\int_{0}^{1}\cos\dfrac{\pi x}{2}\,dx=\dfrac{12}{\pi}$。",
                ],
            },
            {
                "n": 2,
                "title": "（本题 14 分）",
                "items": [
                    r"设函数 $f(x,y)$ 在点 $(0,0)$ 的某个邻域内连续，且 $\lim\limits_{(x,y)\to(0,0)}\dfrac{f(x,y)-xy}{x^{2}+y^{2}}=c$。",
                    r"（1）若 $c>\dfrac12$，$f(0,0)$ 是否为 $f(x,y)$ 的极值？证明你的结论。",
                    r"（2）若 $c=\dfrac12$，则（1）中的结论还成立吗？若成立给出证明，若不成立举出反例。",
                ],
                "solution": [
                    r"（1）由题设 $f(0,0)=0$。若 $c>\dfrac12$，由保号性，在原点小邻域内 $\dfrac{f(x,y)-xy}{x^{2}+y^{2}}\ge\dfrac{c+\frac12}{2}$，于是 $f(x,y)\ge\dfrac12\left(c+\dfrac12\right)(x^{2}+y^{2})+xy\ge 0=f(0,0)$，故 $f(0,0)$ 为极小值。",
                    r"（2）$c=\dfrac12$ 时结论不再成立。取 $f(x,y)=xy+\dfrac12(x^{2}+y^{2})-y^{3}$，满足题设条件，但 $f(x,-x)=x^{3}$，显然 $f(0,0)$ 不是极值。",
                ],
            },
            {
                "n": 3,
                "title": "（本题 14 分）",
                "items": [r"求解微分方程 $x^{2}y''+xy'=y^{2}\ln x,\quad x>0$。"],
                "solution": [
                    r"显然 $y=0$ 为一个特解。当 $y\ne0$ 时，两边同除以 $x^{2}y^{2}$ 得 $\dfrac{y'}{y^{2}}+\dfrac1x\cdot\dfrac1y=\dfrac{\ln x}{x^{2}}$。",
                    r"作变量代换 $u=y^{-1}$，方程化为 $u'-\dfrac1x u=-\dfrac{\ln x}{x^{2}}$，这是关于 $u$ 的一阶线性方程。",
                    r"由通解公式 $u=e^{\int\frac1x dx}\left(-\int\dfrac{\ln x}{x^{2}}e^{-\int\frac1x dx}dx+C\right)=x\left(\dfrac{\ln x}{2x^{2}}-\dfrac12\int\dfrac1{x^{3}}dx+C\right)=x\left(\dfrac{2\ln x+1}{4x^{2}}+C\right)$。",
                    r"代回得原方程通解 $y=\dfrac{1}{Cx+\dfrac{2\ln x+1}{4x}}\ (x>0)$，其中 $C$ 为使表达式有意义的任意常数。",
                ],
            },
            {
                "n": 4,
                "title": "（本题 14 分）",
                "items": [
                    r"已知半径为 $r\ (0<r<2a)$ 的球，其球心在半径为常数 $a$ 的球面上。",
                    r"（1）求半径为 $a$ 的球截得半径为 $r$ 的球的部分球面面积 $S(r)$。",
                    r"（2）当 $S(r)$ 最大时，求两球公共部分的体积。",
                ],
                "solution": [
                    r"（1）设两球面方程为 $x^{2}+y^{2}+z^{2}=a^{2}$ 与 $x^{2}+y^{2}+(z-a)^{2}=r^{2}$，交线所在平面 $z=\dfrac{2a^{2}-r^{2}}{2a}$，投影区域 $D_{xy}:x^{2}+y^{2}\le\dfrac{r^{2}}{4a^{2}}(4a^{2}-r^{2})\triangleq R_{0}^{2}$。",
                    r"球面方程 $z=a-\sqrt{r^{2}-x^{2}-y^{2}}$，面积微元 $\sqrt{1+\left(\dfrac{\partial z}{\partial x}\right)^{2}+\left(\dfrac{\partial z}{\partial y}\right)^{2}}\,dxdy=\dfrac{r}{\sqrt{r^{2}-x^{2}-y^{2}}}\,dxdy$，故 $S(r)=2\pi r\left(r-\sqrt{r^{2}-R_{0}^{2}}\right)=2\pi r^{2}-\dfrac{\pi r^{3}}{a}\ (0<r<2a)$。",
                    r"（2）$S'(r)=4\pi r-\dfrac{3\pi r^{2}}{a}$，令 $S'(r)=0$ 得 $r=\dfrac{4a}{3}$，且 $S''<0$，故此时 $S(r)$ 最大；两球公共部分体积 $V=\displaystyle\int_{0}^{2\pi}d\theta\int_{0}^{\frac{2\sqrt{2}}{3}a}\left(\sqrt{a^{2}-\rho^{2}}+\sqrt{\tfrac{16}{9}a^{2}-\rho^{2}}-a\right)\rho\,d\rho=\dfrac{64}{81}\pi a^{3}$。",
                ],
            },
            {
                "n": 5,
                "title": "（本题 14 分）",
                "items": [
                    r"设 $f(x)$ 在 $\mathbb{R}$ 上有界且二阶连续可导。",
                    r"（1）证明：存在 $\xi\in\mathbb{R}$，使得 $f''(\xi)=0$。",
                    r"（2）若 $f'(x)$ 在 $\mathbb{R}$ 上无界，证明：存在 $\xi\in\mathbb{R}$，使得 $f(\xi)+f''(\xi)=0$。",
                ],
                "solution": [
                    r"（1）反证法：若不存在这样的 $\xi$，则 $f''(x)$ 在 $\mathbb{R}$ 上定号。不妨设 $f''(x)>0$，则 $f'(x)$ 严格单调增加，存在 $\eta$ 使 $f'(\eta)\ne0$；当 $x>\eta$ 时 $f(x)>f(\eta)+f'(\eta)(x-\eta)$，当 $x<\eta$ 时 $f(x)<f(\eta)+f'(\eta)(x-\eta)$，两种情形均与 $f(x)$ 有界矛盾。",
                    r"（2）令 $F(x)=f^{2}(x)+f'^{2}(x)$，则 $F'(x)=2f'(x)\bigl(f(x)+f''(x)\bigr)$。由 $|f(x)|\le M$ 及 $f'(x)$ 无界，可取 $x_{1}$ 使 $|f'(x_{1})|>M+1$、$F(x_{1})>(1+M)^{2}$，再取 $x_{2}>x_{1}$ 使 $F(x_{2})\ge F(x_{1})$。可断言 $F$ 在区间 $[x_{1},\alpha]$ 内部取到最大值，故存在 $\xi\in(x_{1},\alpha)$ 使 $F'(\xi)=2f'(\xi)\bigl(f(\xi)+f''(\xi)\bigr)=0$；又 $f'(\xi)\ne0$，于是 $f(\xi)+f''(\xi)=0$。",
                ],
            },
            {
                "n": 6,
                "title": "（本题 14 分）",
                "items": [
                    r"考虑幂级数 $\sum\limits_{n=1}^{\infty}\dfrac1{n^{p}}x^{n}$，其中 $p\in(0,1)$。",
                    r"（1）求该幂级数的收敛域。",
                    r"（2）设该幂级数的和函数为 $f(x)$，求由 $f^{2}(x)$ 得到的幂级数的收敛域。",
                ],
                "solution": [
                    r"（1）易知收敛域为 $[-1,1)$。",
                    r"（2）$f^{2}(x)=\sum\limits_{n=2}^{\infty}c_{n}x^{n}$，$c_{n}=\sum\limits_{i=1}^{n-1}\dfrac1{(i(n-i))^{p}}$。该级数在 $(-1,1)$ 上收敛，在 $x=1$ 处发散；讨论 $x=-1$ 处即 $\sum(-1)^{n}c_{n}$ 的收敛性。",
                    r"情形 $0<p\le\dfrac12$：由 $i(n-i)\le\dfrac{n^{2}}4$ 得 $c_{n}\ge\sum\limits_{i=1}^{n-1}\dfrac{2^{p}}{n^{2p}}\ge 2^{p}n^{1-2p}$，$\{c_{n}\}$ 不收敛于 $0$，级数不收敛。",
                    r"情形 $\dfrac12<p<1$：由 $(a+b)^{p}\le a^{p}+b^{p}$ 得 $c_{n}\le\dfrac{4}{(1-p)n^{2p-1}}\to0$，级数收敛。故 $f^{2}(x)$ 的幂级数收敛域为 $[-1,1)$（$p>\frac12$）或 $(-1,1)$（$p\le\frac12$）。",
                ],
            },
        ],
    },
    "18B初": {
        "group": "非数学B 类",
        "questions": [
            {
                "n": 1,
                "title": "填空题（本题 30 分，每小题 6 分）",
                "items": [
                    r"极限 $\lim\limits_{x\to0}\left(\dfrac{1}{\ln(1+x)}-\dfrac1x\right)=$ ________.",
                    r"若函数 $f(x)=\begin{cases}e^{x}(\sin x+\cos x),&x\ge0\\ abx^{2}+ax+2a+b,&x<0\end{cases}$ 的导函数在 $\mathbb{R}$ 上连续，则 $3a+2b=$ ________.",
                    r"点 $(2024,2025,2026)$ 关于平面 $x+y+z=6078$ 的对称点为 ________.",
                    r"计算二重积分 $\displaystyle\int_{0}^{1}dx\int_{x}^{1}\cos y^{2}\,dy=$ ________.",
                    r"设 $f(x,y)$ 具有连续偏导数，$f(1,1)=1,\ f'_x(1,1)=1,\ f'_y(1,1)=2$。若 $\varphi(x)=f(x,f(x,x))$，则 $\varphi'(1)=$ ________.",
                ],
                "solution": [
                    r"（1）$\ln(1+x)=x-\dfrac{x^{2}}2+o(x^{2})$，故极限为 $\dfrac12$。（2）同 A 卷：$2a+b=1,\ a=2,\ b=-3$，$3a+2b=0$。",
                    r"（3）过已知点且垂直于平面的直线为 $\dfrac{x-2024}{1}=\dfrac{y-2025}{1}=\dfrac{z-2026}{1}=t$，代入平面得 $t=1$，垂足 $(2025,2026,2027)$，对称点 $(2026,2027,2028)$。",
                    r"（4）交换积分次序：$\int_{0}^{1}dx\int_{x}^{1}\cos y^{2}\,dy=\int_{0}^{1}dy\int_{0}^{y}\cos y^{2}\,dx=\int_{0}^{1}y\cos y^{2}\,dy=\dfrac{\sin1}{2}$。",
                    r"（5）$\varphi'(1)=f'_x(1,1)+f'_y(1,1)\bigl[f'_x(1,1)+f'_y(1,1)\bigr]=1+2(1+2)=7$。",
                ],
            },
            {
                "n": 2,
                "title": "（本题 14 分）",
                "items": [
                    r"设 $f(x)$ 在 $[0,+\infty)$ 上连续、非负，且满足 $\lim\limits_{x\to+\infty}f(x)\displaystyle\int_{0}^{x}f(t)\,dt=2$。求 $\lim\limits_{x\to+\infty}\sqrt{x}\,f(x)$。",
                ],
                "solution": [
                    r"记 $F(x)=\int_{0}^{x}f(t)\,dt$，则 $F$ 单调递增、非负且 $F'(x)=f(x)$。",
                    r"由洛必达法则及题设 $\lim\limits_{x\to+\infty}\dfrac{F^{2}(x)}{x}=2\lim\limits_{x\to+\infty}f(x)F(x)=4$，因而 $\lim\limits_{x\to+\infty}\dfrac{F(x)}{\sqrt{x}}=2$。",
                    r"故 $\lim\limits_{x\to+\infty}\sqrt{x}\,f(x)=\lim\limits_{x\to+\infty}\dfrac{f(x)F(x)}{F(x)/\sqrt{x}}=\dfrac{2}{2}=1$。",
                ],
            },
            {
                "n": 3,
                "title": "（本题 14 分）",
                "items": [
                    r"设 $a>0$ 为常数，曲线 $L:y=\sqrt{x-a},\ x\ge a$。记曲线 $L$ 与它的过原点的切线及 $x$ 轴围成的平面图形为 $D$，求 $D$ 的面积及 $D$ 绕 $x$ 轴旋转一周所成旋转体的体积。",
                ],
                "solution": [
                    r"设切点为 $(x_{0},y_{0})$，$y_{0}=\sqrt{x_{0}-a}$，切线斜率 $k=\dfrac1{2\sqrt{x_{0}-a}}$；又切线过原点 $k=\dfrac{y_{0}}{x_{0}}$，联立得 $x_{0}=2a,\ y_{0}=\sqrt a$，切线方程 $y=\dfrac1{2\sqrt a}x$。",
                    r"面积 $A=\displaystyle\int_{0}^{2a}\dfrac{x}{2\sqrt a}\,dx-\int_{a}^{2a}\sqrt{x-a}\,dx=\left.\dfrac{x^{2}}{4\sqrt a}\right|_{0}^{2a}-\left.\dfrac23(x-a)^{3/2}\right|_{a}^{2a}=\dfrac13a^{3/2}$。",
                    r"体积 $V=\pi\displaystyle\int_{0}^{2a}\left(\dfrac{x}{2\sqrt a}\right)^{2}dx-\pi\int_{a}^{2a}(x-a)\,dx=\dfrac{\pi a^{2}}{6}$。",
                ],
            },
            {
                "n": 4,
                "title": "（本题 14 分）",
                "items": [r"求解微分方程 $x^{2}y''+xy'=y^{2}\ln x,\quad x>0$。"],
                "solution": [
                    r"与 A 卷第三题相同：$y=0$ 为特解；令 $u=y^{-1}$ 化为一阶线性方程 $u'-\dfrac1x u=-\dfrac{\ln x}{x^{2}}$。",
                    r"解得 $u=x\left(\dfrac{2\ln x+1}{4x^{2}}+C\right)$，故通解 $y=\dfrac{1}{Cx+\dfrac{2\ln x+1}{4x}}\ (x>0)$。",
                ],
            },
            {
                "n": 5,
                "title": "（本题 14 分）",
                "items": [
                    r"考虑幂级数 $\sum\limits_{n=1}^{\infty}\dfrac1n x^{n}$。",
                    r"（1）求此幂级数的收敛域。",
                    r"（2）设该幂级数的和函数为 $f(x)$，求 $f^{2}(x)$ 得到的幂级数的收敛域。",
                ],
                "solution": [
                    r"（1）易知此幂级数的收敛域为 $[-1,1)$。",
                    r"（2）计算可知 $f^{2}(x)=\sum\limits_{n=2}^{\infty}c_{n}x^{n}$，其中 $c_{n}=\sum\limits_{i=1}^{n-1}\dfrac1{i(n-i)}$。该级数在 $(-1,1)$ 上收敛，在 $x=1$ 处发散；讨论 $x=-1$ 处即 $\sum\limits_{n=2}^{\infty}(-1)^{n}c_{n}$ 的收敛性。",
                    r"由 $c_{n}=\dfrac{2}{n}\sum\limits_{i=1}^{n-1}\dfrac1i$ 及积分估计 $c_{n}\le\dfrac{1+\ln(n-1)}{2n}$ 得 $\lim\limits_{n\to\infty}c_{n}=0$；又有 $c_{n}-c_{n+1}\ge0$，即 $c_{n}$ 单调递减趋于 $0$，故交错级数收敛。",
                    r"综上，$f^{2}(x)$ 得到的幂级数收敛域为 $[-1,1)$。",
                ],
            },
            {
                "n": 6,
                "title": "（本题 14 分）",
                "items": [
                    r"设 $f(x)$ 在 $\mathbb{R}$ 上有界且二阶连续可导。",
                    r"（1）证明：存在 $\xi\in\mathbb{R}$，使得 $f''(\xi)=0$。",
                    r"（2）若 $f'(x)$ 在 $\mathbb{R}$ 上无界，证明：存在 $\xi\in\mathbb{R}$，使得 $f(\xi)+f''(\xi)=0$。",
                ],
                "solution": [
                    r"（1）反证法同 A 卷第五题：若 $f''$ 定号，则 $f'$ 严格单调，取 $\eta$ 使 $f'(\eta)\ne0$，两侧线性估计与 $f$ 有界矛盾。",
                    r"（2）令 $F(x)=f^{2}(x)+f'^{2}(x)$，$F'(x)=2f'(x)\bigl(f(x)+f''(x)\bigr)$；由 $f$ 有界、$f'$ 无界可构造内点最大值，得 $F'(\xi)=0$ 且 $f'(\xi)\ne0$，故 $f(\xi)+f''(\xi)=0$。",
                ],
            },
        ],
    },
}
