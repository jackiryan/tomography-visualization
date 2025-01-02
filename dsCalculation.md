# Satellite distance ($d_s$) calculation

  

The satellites in this visualization are treated as though they are co-orbital in an idealized circular Keplerian orbit around a spherical Earth with radius $R_E = 6371km$. Using these assumptions and specifying an arbitrary altitude for the orbit of the tomography constellation, we can compute the relative spacing between satellites in the constellation in terms of the maximum observation angle for the leading or trailing satellite of the constellation relative to the central (nadir-pointed) member. This distance is approximate as it does not take into account orbital drift between satellites, maneuvers, and the numerous additional physical factors taken into account when numerically solving the orbit of a satellite using general perturbation theory; however, it can aid in estimating the time steps between observations in the constellation for a multi-camera per spacecraft mission concept, and to give a ballpark of operational limitations on the mission design (i.e., satellites too close together).

  

## Geometric Definition of the Calculation
### Conceptual description
Suppose two satellites lie on a circle whose radius is $R = R_E + h$, where $R_E$ is the radius of a spherical Earth (~6371 km) and $h$ is the orbital altitude of the satellites. For this visualization, $h = 400 km$, a Low-Earth Orbit (LEO) altitude approximately in line with the International Space Station (ISS). The center of the circle (that is, the Earth) lies at the origin, which we will call point $C$. One of the satellites lies at point $P_0$, which is directly above an observation point $Q$ lying on an inner circle with radius $R_E$ and also centered at $C$ -- point $Q$ lies along the line between $P_0$ and $C$. Conceptually $P_0$ is the "nadir-pointing" satellite, or the central spacecraft in the constellation. Point $P_1$ is the position of the second satellite, and the angle $\angle P_0QP_1$ is given as $\theta$. $\theta$ can be thought of as the observation angle of the satellite $P_1$ to the subject point $Q$. A separate angle $\phi$ is defined as the angle $\angle P_0CP_1$, and describes the angular separation between the two satellites along the same orbit.

### Known Coordinates
The problem has now been defined in a way that allows us to work entirely in 2-D, since we assume the satellites are perfectly co-orbital.

1.  $C$ is at the origin $(0, 0)$.
2.  $P_0$ lies on the $+x$-axis at $(R_E + h, 0)$.
3. The angle $\phi = \angle P_0 C P_1$ is then the angle by which we rotate $P_0$ about the origin to land on $P_1$.
Thus:

$$
P_1 = \bigl((R_E+h)\cos\phi, (R_E+h)\sin\phi\bigr).
$$

4. Since $Q$ is on the line $C P_0$ and $CQ = R_E$, $QP_0 = h$, the coordinates of $Q$ are:

$$
Q = (R_E, 0) \quad \text{(because $CQ = R_E$ along the $+x$-axis)}.
$$

So we have:

$$
\begin{flalign*}
P_0 &= \bigl(R_E + h, 0\bigr), \quad \\
P_1 &= \bigl((R_E + h)\cos\phi, (R_E + h)\sin\phi\bigr), \quad \\
Q &= (R_E, 0).
\end{flalign*}
$$

## Derivation of $\phi(\theta)$

**Note**: In this section, $R_E$ is referred to as $R$ for simplicity.

### Express $\theta = \angle P_0 Q P_1$ via dot products

The angle $\theta$ at $Q$ is formed by the vectors:

$$
\begin{flalign*}
\overrightarrow{QP_0} = P_0 - Q &= \bigl((R+h) - R, 0\bigr) = (h, 0), \\
\overrightarrow{QP_1} = P_1 - Q &= \bigl((R+h)\cos\phi - R, (R+h)\sin\phi\bigr).
\end{flalign*}
$$

To compute $\cos(\theta)$, we use the formula for the cosine of the angle between two vectors:

$$
\cos(\theta) = \frac{\overrightarrow{QP_0} \cdot \overrightarrow{QP_1}}{\lvert \overrightarrow{QP_0} \rvert \lvert \overrightarrow{QP_1} \rvert}.
$$

1. **Dot Product (Numerator)**:

$$
\overrightarrow{QP_0} \cdot \overrightarrow{QP_1} = (h, 0) \cdot \bigl((R+h)\cos\phi - R, (R+h)\sin\phi\bigr) = h \bigl((R+h)\cos\phi - R\bigr).
$$

2. **Magnitudes (Denominator)**:

$$
\begin{flalign*}
\lvert \overrightarrow{QP_0} \rvert &= h, \\
\lvert \overrightarrow{QP_1} \rvert &= \sqrt{\bigl((R+h)\cos\phi - R\bigr)^2 + \bigl((R+h)\sin\phi\bigr)^2}.
\end{flalign*}
$$

Expanding the square root:

$$
\bigl((R+h)\cos\phi - R\bigr)^2 + \bigl((R+h)\sin\phi\bigr)^2 = (R+h)^2 + R^2 - 2R(R+h)\cos\phi.
$$

Thus:

$$
\lvert \overrightarrow{QP_1} \rvert = \sqrt{R^2 + (R+h)^2 - 2R(R+h)\cos\phi}.
$$

3. **Final Expression for $\cos(\theta)$, $h$ from the dot product term in the numerator and $\lvert \overrightarrow{QP_0} \rvert = h$ in the denominator cancel**:

$$
\cos(\theta) = \frac{(R+h)\cos\phi - R}{\sqrt{R^2 + (R+h)^2 - 2R(R+h)\cos\phi}}.
$$

### Solving for $\phi$ in terms of $\theta$

From the previous section, the relationship between $\cos(\theta)$ and $\phi$ is:

$$
\cos(\theta) = \frac{(R+h)\cos\phi - R}{\sqrt{R^2 + (R+h)^2 - 2R(R+h)\cos\phi}}.
$$

This equation is actually quite difficult to solve due to the presence of $\cos\phi$ and $\cos^2\phi$ terms when attempting to isolate phi. We can use an "isolate-square-substitute" method to solve. That is, we isolate the square root term, square both sides, and substitute $x = \cos\phi$ to solve using the quadratic formula:

1. The full algebraic work is not shown in detail in this document, but suffice it to say that we multiply both sides by the denominator, square both sides to remove the square root, expand terms, and combine to get all terms on one side of the equation. We can then define the problem in the following manner:

$$
\begin{flalign*}
&x = \cos\phi, \\
&Ax^2 + Bx + C = 0, \\
&-(R+h)^{2}x^{2} + 2R(R+h)\sin^{2}(\theta)x + \left[(R+h)^{2}\cos^{2}(\theta) - R^{2}\sin^{2}(\theta)\right] = 0.
\end{flalign*}
$$

where the terms $A$, $B$, and $C$ are now expressions in terms of $R$, $h$, and $\theta$.

2. Using the quadratic formula, we can now solve the problem in terms of $\cos\phi$. Putting this into Wolfram Alpha, we get a very complex set of equations, a positive and negative solution, that is not written down here, but you can input the equation from the previous section and ask it to solve for $x$ to see for yourself. First, we can discard the negative solution as it is not physically relevant in the context of this problem. When doing the algebra, there is a convenient $(R+h)$ term that can be canceled from the numerator and denominator. We need to use the identities $\sin^2\theta+\cos^2\theta=1$ and $1-\cos^2\theta=\sin^2\theta$ to simplify the terms inside the square root. Ultimately, there will a $\cos\theta$ term that can be pulled out of the square root (in addition to the $(R+h)$ term). It should technically be $\lvert \cos\theta \rvert$ when it is pulled out, but since we constrain $0 \leq \theta \leq \pi/2$ we can simply write it as $\cos\theta$:

$$
\cos\phi = \frac{R \sin^2\theta + \cos\theta \sqrt{R^2 \cos^2\theta + 2Rh + h^2}}{R + h}.
$$

3. Final expression for $\phi$ in terms of $\theta$:

$$
\phi(\theta) = \arccos\left(\frac{R \sin^2\theta + \cos\theta \sqrt{R^2 \cos^2\theta + h (2R + h)}}{R + h}\right).
$$

This relationship can be viewed on Desmos using the following link: https://www.desmos.com/calculator/u9d6uulogx
Try different values of $h$ using the slider to understand the relationship between satellite spacing as altitude increases! For small $\phi$ and $\theta$ (up to around $\pi/4$), the relationship between $h$ and $\phi$ is approximately linear. Recall that the domain is $0 \leq \theta \leq \pi/2$ to keep the values for phi physically meaningful. In the visualization, the max value of $\theta$ is further limited to $75^\circ$.

## Computing $d_s$ from $\phi$
Now that we have a formula for $\phi$, we can compute the distance between the satellites using the formula for a chord:

$$
L =d_s = 2(R+h)\sin(\phi/2)
$$

This is the same value that is used for $d_s$ in the legend of the JavaScript visualization. 

## JavaScript Implementation
In the code, the calculation of $\phi$ is implemented like so:
```javascript
function computePhi(theta, N, R, h) {
    const sinThetaSquared = Math.sin(theta)**2;
    const cosTheta = Math.cos(theta);
    const sqrtTerm = Math.sqrt(R**2 * cosTheta**2 + h * (2 * R + h));
    const numerator = R * sinThetaSquared + cosTheta *  sqrtTerm;
    const denominator = R + h;

    // Since theta is really theta_max, the most extreme
    // observation angle, the corresponding phi is the spacing
    // across all satellites in one "wing" of the constellation
    const  phiAll = Math.acos(numerator / denominator);

    let phi = phiAll;
    if (N > 1) {
        phi = 2 * phiAll / (N - 1);
    }

    return  phi;
}
```
In the GUI of the application, $\theta$ is adjustable within a range from 15 to 75 degrees and the number of satellites is adjustable for odd numbers from 1 to 11. To visualize the satellites, R and h are set to arbitrary values (100 and 0.4) that help frame the objects in the scene. To obtain the value of $d_s$ displayed in the legend, the "physically correct" values of `R = 6371` and `h = 400` are used.

Likewise, $d_s$ is computed using this function:
```javascript
function  computeDs(phi) {
    const R_E = 6371;
    const R = R_E + satParms.realH;
    const L = 2 * R * Math.sin(phi / 2);
    return L;
}
```
