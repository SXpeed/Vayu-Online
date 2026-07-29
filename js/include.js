// Injects the shared header/footer from /partials into every page,
// marks the current page as active in both menus, then loads script.js.
// Requires the site to be served over HTTP (e.g. Live Server) — fetch()
// cannot read local files when a page is opened directly via file://.

const inject = async (id, file) => {
    const slot = document.getElementById(id);
    if (!slot) return;
    const res = await fetch(file);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    slot.outerHTML = await res.text();
};

try {
    await inject('site-header', '/partials/header.html');
    await inject('site-footer', '/partials/footer.html');
} catch (err) {
    console.error('Could not load shared header/footer. Serve the site over HTTP (Live Server), not file://.', err);
}

// highlight the current page in the desktop menu and mobile bottom nav
const page = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.menu a, .mobile-bottom-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
        a.classList.add('active');
        a.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
});

// Smooth Page Switch Transition
document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript') && !href.startsWith('tel') && !href.startsWith('mailto') && link.target !== '_blank') {
        link.addEventListener('click', e => {
            const currentPage = location.pathname.split('/').pop() || 'index.html';
            if (href !== currentPage) {
                e.preventDefault();
                document.body.classList.add('page-transitioning');
                setTimeout(() => {
                    window.location.href = href;
                }, 180);
            }
        });
    }
});

// load site behaviors only after the header exists in the DOM
const s = document.createElement('script');
s.src = '/js/script.js';
document.body.appendChild(s);