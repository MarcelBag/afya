/**
 * particles-hero.js
 * drawing a canvas particle-constellation (floating dots + connecting lines)
 */

(function () {
    const cfg = Object.assign({
        selector: '.hero',   // hero element selector
        count: 55,        // number of dots
        color: '255,255,255', // RGB of dots & lines
        dotOpacity: 0.55,
        lineOpacity: 0.15,
        speed: 0.38,      // pixels per frame
        dotRadius: 2.2,
        lineDistance: 130,       // px max distance to draw a line
        interactive: true,      // dots gently flee the mouse
    }, window.PARTICLES_CONFIG || {});

    function init() {
        const hero = document.querySelector(cfg.selector);
        if (!hero) return;

        /* canvas setup */
        const canvas = document.createElement('canvas');
        Object.assign(canvas.style, {
            position: 'absolute', inset: '0',
            width: '100%', height: '100%',
            pointerEvents: 'none',
            zIndex: '1',
        });
        hero.style.position = 'relative';   // ensure hero is positioned
        hero.insertBefore(canvas, hero.firstChild);

        const ctx = canvas.getContext('2d');
        let W, H, mouse = { x: -9999, y: -9999 };

        function resize() {
            W = canvas.width = hero.offsetWidth;
            H = canvas.height = hero.offsetHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        /* mouse tracking */
        if (cfg.interactive) {
            hero.addEventListener('mousemove', e => {
                const r = hero.getBoundingClientRect();
                mouse.x = e.clientX - r.left;
                mouse.y = e.clientY - r.top;
            });
            hero.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
        }

        /* particle factory */
        function makeParticle() {
            const angle = Math.random() * Math.PI * 2;
            const spd = (0.3 + Math.random() * 0.7) * cfg.speed;
            return {
                x: Math.random() * (W || 800),
                y: Math.random() * (H || 400),
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                r: cfg.dotRadius * (0.6 + Math.random() * 0.8),
            };
        }

        let particles = Array.from({ length: cfg.count }, makeParticle);

        /* animation loop */
        function draw() {
            ctx.clearRect(0, 0, W, H);

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];

                /* gentle mouse repulsion */
                if (cfg.interactive) {
                    const dx = p.x - mouse.x, dy = p.y - mouse.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 90) {
                        const force = (90 - dist) / 90 * 0.6;
                        p.vx += (dx / dist) * force;
                        p.vy += (dy / dist) * force;
                    }
                }

                /* speed cap */
                const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (spd > cfg.speed * 2) { p.vx *= 0.96; p.vy *= 0.96; }

                p.x += p.vx;
                p.y += p.vy;

                /* wrap edges */
                if (p.x < -10) p.x = W + 10;
                if (p.x > W + 10) p.x = -10;
                if (p.y < -10) p.y = H + 10;
                if (p.y > H + 10) p.y = -10;

                /* draw dot */
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${cfg.color},${cfg.dotOpacity})`;
                ctx.fill();

                /* draw connecting lines */
                for (let j = i + 1; j < particles.length; j++) {
                    const q = particles[j];
                    const dx = p.x - q.x, dy = p.y - q.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < cfg.lineDistance) {
                        const alpha = cfg.lineOpacity * (1 - d / cfg.lineDistance);
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(q.x, q.y);
                        ctx.strokeStyle = `rgba(${cfg.color},${alpha})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(draw);
        }

        draw();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();