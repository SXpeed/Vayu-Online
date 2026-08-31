/**
 * Vayu — the home hero carousel.
 *
 * This was an inline <script> at the foot of the old public/index.html, and
 * the port to app/routes/+page.svelte left it behind. What survived was the
 * call site: core/site-content.js still asked for `window.vayuInitHero?.()`,
 * a global nothing defined any more — and the `?.` meant it failed silently.
 * The hero shipped two slides and a pair of progress bars, and simply sat on
 * the first one for ever.
 *
 * It is a module export now rather than a global, so the thing that calls it
 * and the thing that defines it are checked against each other at build time
 * instead of meeting, or not meeting, on `window` at runtime.
 *
 * `initHero` is re-runnable by design: the slides are editable in the admin
 * panel, so the section is rebuilt from /api/nav after first paint and this
 * runs again over the new markup. Each run tears its predecessor down first —
 * the interval, and the listeners bound to things that outlive a rebuild (the
 * section itself, the document) would otherwise survive as a second slideshow
 * fighting the first.
 */

/**
 * Must match --hero-delay in styles.css, or the progress rail fills out of
 * step with the slide it is measuring.
 *
 * Hovering does NOT pause this. It used to: mouseenter stopped the timer and
 * mouseleave started it again, which meant the one visitor actually looking
 * at the hero — cursor resting on the image — was the one who never saw the
 * second slide. A carousel that stops when watched is a carousel with one
 * slide. A hidden tab still stops it, because nobody is watching that.
 */
const DELAY = 5000;

export function initHero() {
    const hero = document.getElementById('homeHero');
    if (!hero) return;

    hero._vayuTeardown?.();

    const slides = [...hero.querySelectorAll('[data-hero-slide]')];
    const bars = [...hero.querySelectorAll('.hero-bar')];
    if (slides.length < 2) return;

    let index = 0;
    let timer = null;

    const go = (i) => {
        index = (i + slides.length) % slides.length;
        slides.forEach((s, n) => s.classList.toggle('is-active', n === index));
        bars.forEach((b, n) => {
            b.classList.toggle('is-active', n === index);
            b.setAttribute('aria-selected', String(n === index));
        });
        // Restart the fill from zero. Re-adding the class alone would not
        // retrigger an animation already running on that element, and
        // getAnimations() forces the style recalc that creates it.
        bars[index]?.querySelector('.hero-bar-fill')
            ?.getAnimations().forEach(a => { a.currentTime = 0; a.play(); });
    };

    const stop = () => {
        clearInterval(timer);
        timer = null;
        hero.classList.add('is-paused');
    };

    const start = () => {
        hero.classList.remove('is-paused');
        if (timer || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        timer = setInterval(() => go(index + 1), DELAY);
    };

    // A hidden tab should not burn through the slides unwatched.
    const onVisibility = () => (document.hidden ? stop() : start());

    bars.forEach((b, n) => b.addEventListener('click', () => { stop(); go(n); start(); }));
    document.addEventListener('visibilitychange', onVisibility);

    hero._vayuTeardown = () => {
        clearInterval(timer);
        timer = null;
        document.removeEventListener('visibilitychange', onVisibility);
        hero._vayuTeardown = null;
    };

    start();
}
