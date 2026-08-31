<script>
  /**
   * Vayu — the site footer, the mobile bottom nav and the slide-up menu
   * sheet.
   *
   * Ported from src/partials/footer.html. Same story as the header: the
   * collection columns and the mobile accordion were filled in by
   * js/nav-render.js at runtime and are {#each} blocks now.
   */
  import { categories, subsOf, catHref } from '#lib/taxonomy.js';
  import Newsletter from './Newsletter.svelte';

  const CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>';

  const entries = $derived(Object.entries(categories()));
</script>

<footer class="site-footer-container">
  <Newsletter />
  <!-- DESKTOP FOOTER (Visible on > 768px) -->
  <div class="foot-container desktop-footer-view">
    <div class="foot-top-row">
      <div class="foot-logo">
        <span class="word">VAYU</span>
      </div>
      <!-- The networks' own marks, as each brand publishes them: solid
           glyphs on a 24x24 grid, in the brand's own colour, standing on
           the footer with no ring or plate around them.

           Filled, not stroked — these are the official silhouettes and
           they are meant to be filled. Instagram has no flat colour of its
           own, so it carries the corner-to-corner gradient from its brand
           guidelines; the gradient id is namespaced because the mobile
           footer is in the same document and ids are global. -->
      <div class="socials">
        <a href="https://instagram.com" class="social-insta" aria-label="Instagram" target="_blank"
          rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true">
            <defs>
              <radialGradient id="vayuIgGrad" cx="0.3" cy="1.07" r="1.1">
                <stop offset="0%" stop-color="#FDD54F" />
                <stop offset="24%" stop-color="#F67D28" />
                <stop offset="50%" stop-color="#DC2743" />
                <stop offset="76%" stop-color="#CC2366" />
                <stop offset="100%" stop-color="#8A3AB9" />
              </radialGradient>
            </defs>
            <path fill="url(#vayuIgGrad)"
              d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.64.07 4.85 0 3.2-.01 3.58-.07 4.85-.15 3.22-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07-3.2 0-3.58-.01-4.85-.07-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12c0-3.2.01-3.58.07-4.85.15-3.23 1.66-4.77 4.92-4.92C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 2.7.27.28 2.69.07 7.05.01 8.33 0 8.74 0 12c0 3.26.01 3.67.07 4.95.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24c3.26 0 3.67-.01 4.95-.07 4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95 0-3.26-.01-3.67-.07-4.95-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z" />
          </svg></a>
        <a href="https://facebook.com" class="social-fb" aria-label="Facebook" target="_blank"
          rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true">
            <path fill="#1877F2"
              d="M24 12.07C24 5.44 18.63.07 12 .07S0 5.44 0 12.07c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.02 24 18.06 24 12.07Z" />
          </svg></a>
        <a href="https://pinterest.com" class="social-pin" aria-label="Pinterest" target="_blank"
          rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true">
            <path fill="#E60023"
              d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.42 7.62 11.16-.11-.95-.2-2.4.04-3.44.22-.94 1.4-5.96 1.4-5.96s-.36-.72-.36-1.78c0-1.66.97-2.91 2.17-2.91 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-1 4-.28 1.19.6 2.16 1.78 2.16 2.13 0 3.77-2.24 3.77-5.49 0-2.86-2.06-4.86-5.01-4.86-3.41 0-5.41 2.56-5.41 5.2 0 1.03.4 2.14.89 2.74.1.12.11.22.08.35-.09.37-.29 1.2-.33 1.36-.05.22-.17.27-.4.16-1.5-.69-2.44-2.87-2.44-4.64 0-3.78 2.75-7.25 7.92-7.25 4.16 0 7.39 2.96 7.39 6.92 0 4.13-2.6 7.46-6.23 7.46-1.21 0-2.35-.63-2.76-1.38l-.75 2.85c-.27 1.04-1 2.35-1.5 3.15 1.13.35 2.31.53 3.55.53 6.63 0 12-5.37 12-12S18.63 0 12 0Z" />
          </svg></a>
        <a href="https://youtube.com" class="social-yt" aria-label="YouTube" target="_blank"
          rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true">
            <path fill="#FF0000"
              d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81Z" />
            <path fill="#FFFFFF" d="M9.55 15.57V8.43L15.82 12l-6.27 3.57Z" />
          </svg></a>
      </div>
    </div>
    <div class="foot-grid">
      <div class="foot-col">
        <h4>COLLECTION</h4>
        <!-- from the taxonomy, like every other category list -->
        <ul>
          {#each entries as [slug, cat] (slug)}
            <li><a href={catHref(slug)}>{cat.title}</a></li>
          {/each}
        </ul>
      </div>
      <div class="foot-col">
        <h4>HELP</h4>
        <ul>
          <li><a href="/pages/help.html">Shipping & Delivery</a></li>
          <li><a href="/pages/help.html">Returns & Exchanges</a></li>
          <li><a href="/pages/help.html">FAQs</a></li>
          <li><a href="/pages/user-profile.html">Track Order</a></li>
          <li><a href="/pages/help.html">Care Guide</a></li>
          <li><a href="/pages/help.html">Contact Us</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h4>ABOUT</h4>
        <ul>
          <li><a href="/pages/about.html">Our Story</a></li>
          <li><a href="/pages/artist.html">Designers & Artists</a></li>
          <li><a href="/pages/press.html">Press</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h4>VISIT US</h4>
        <address>
          VAYU — Design for Living<br>
          Shop No. 14, Main Market<br>
          Lodhi Road, Block 8, Lodi Colony<br>
          New Delhi — 110003, India<br>
          <a href="tel:+918595977845" style="display:inline-block; margin-top:6px;">+91 8595977845</a><br>
          <a href="mailto:info@vayuonline.com">info@vayuonline.com</a>
        </address>
        <a class="get-dir" href="https://maps.app.goo.gl/GdmtApHnAYBem1Cr8" target="_blank"
          rel="noopener noreferrer">GET DIRECTIONS &nbsp;&nbsp;→</a>
      </div>
    </div>
  </div>

  <!-- MOBILE FOOTER (Matching User Design Image) -->
  <div class="mobile-footer-view">
    <!-- Card 1: Brand & Socials -->
    <div class="m-foot-card m-foot-brand-card">
      <div class="m-foot-brand-content">
        <div class="m-foot-logo">
          <span class="word">VAYU</span>
        </div>
        <div class="m-social-row">
          <a href="https://instagram.com" class="m-social-btn" aria-label="Instagram" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </a>
          <a href="https://facebook.com" class="m-social-btn" aria-label="Facebook" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 9h3l.5-3H14V4.5c0-.8.3-1.5 1.5-1.5H17V.2C16.6.1 15.4 0 14.3 0 11.8 0 10 1.5 10 4.2V6H7v3h3v9h4V9z" />
            </svg>
          </a>
          <a href="https://pinterest.com" class="m-social-btn" aria-label="Pinterest" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="M12 2C6.5 2 2 6.5 2 12c0 4.2 2.6 7.8 6.2 9.3-.1-.8-.2-2 0-2.9l1.1-4.7s-.3-.6-.3-1.4c0-1.3.8-2.3 1.7-2.3.8 0 1.2.6 1.2 1.3 0 .8-.5 2-.8 3.2-.2 1 .5 1.8 1.5 1.8 1.8 0 3-2.3 3-4.5 0-1.9-1.3-3.3-3.6-3.3-2.6 0-4.2 2-4.2 4.3 0 .8.2 1.4.6 1.8l-.3 1.1c0 .2-.2.3-.4.2-1.1-.5-1.7-1.9-1.7-3.4 0-2.7 2.3-6 6.8-6 3.6 0 6 2.6 6 5.4 0 3.7-2.1 6.5-5.1 6.5-1 0-2-.5-2.3-1.2l-.6 2.5c-.2 1-.7 2-1.2 2.8A10 10 0 1 0 12 2z" />
            </svg>
          </a>
          <a href="https://youtube.com" class="m-social-btn" aria-label="YouTube" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="M22.5 7c-.2-1.2-.9-2-2.1-2.2C18.5 4.5 12 4.5 12 4.5s-6.5 0-8.4.3C2.4 5 1.7 5.8 1.5 7 1.2 8.8 1.2 12 1.2 12s0 3.2.3 5c.2 1.2.9 2 2.1 2.2 1.9.3 8.4.3 8.4.3s6.5 0 8.4-.3c1.2-.2 1.9-1 2.1-2.2.3-1.8.3-5 .3-5s0-3.2-.3-5z" />
              <path d="M10 15.5v-7l6 3.5-6 3.5z" fill="currentColor" stroke="none" />
            </svg>
          </a>
        </div>
      </div>
    </div>

    <!-- Card 2: COLLECTION & HELP 2-Column Split -->
    <div class="m-foot-card m-foot-links-card">
      <div class="m-foot-col">
        <div class="m-col-title">COLLECTION</div>
        <!-- from the taxonomy, like every other category list -->
        <ul class="m-col-list">
          {#each entries as [slug, cat] (slug)}
            <li><a href={catHref(slug)}><span>{cat.title}</span> {@html CHEVRON}</a></li>
          {/each}
        </ul>
      </div>
      <div class="m-col-divider"></div>
      <div class="m-foot-col">
        <div class="m-col-title">HELP</div>
        <ul class="m-col-list">
          <li><a href="/pages/help.html"><span>Shipping & Delivery</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg></a></li>
          <li><a href="/pages/help.html"><span>Returns & Exchanges</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg></a></li>
          <li><a href="/pages/help.html"><span>FAQs</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg></a></li>
          <li><a href="/pages/user-profile.html"><span>Track Order</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg></a></li>
          <li><a href="/pages/help.html"><span>Care Guide</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg></a></li>
          <li><a href="/pages/help.html"><span>Contact Us</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg></a></li>
        </ul>
      </div>
    </div>

    <!-- Card 3: ABOUT Icon Grid -->
    <div class="m-foot-card m-foot-about-card">
      <div class="m-about-head">
        <span class="m-ornament">◇</span>
        <span class="m-about-title">ABOUT</span>
        <span class="m-ornament">◇</span>
      </div>
      <div class="m-about-grid">
        <a href="/pages/about.html" class="m-about-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
            <path d="M10 21v-7h4v7" />
          </svg>
          <span>Our Story</span>
        </a>
        <a href="/pages/artist.html" class="m-about-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Designers & Artists</span>
        </a>
        <a href="/pages/press.html" class="m-about-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 22h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v16" />
            <path d="M18 14h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" />
            <path d="M8 6h6M8 10h6M8 14h4" />
          </svg>
          <span>Press</span>
        </a>
      </div>
    </div>

    <!-- Card 4: VISIT US & Store Illustration -->
    <div class="m-foot-card m-foot-visit-card">
      <div class="m-visit-left">
        <div class="m-col-title">VISIT US</div>
        <div class="m-address-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <div>
            <strong>Vayu — Design for Living</strong><br>
            Shop No. 14, Main Market<br>
            Lodhi Road, Block 8, Lodi Colony<br>
            New Delhi – 110003, India
          </div>
        </div>
        <div class="m-address-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <a href="tel:+918595977845">+91 8595977845</a>
        </div>
        <div class="m-address-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.5 6a2 2 0 0 1-2.5 0L2 7" />
          </svg>
          <a href="mailto:info@vayuonline.com">info@vayuonline.com</a>
        </div>
      </div>
      <div class="m-visit-right">
        <div class="m-store-sketch">
          <svg viewBox="0 0 200 120" fill="none" stroke="#6E726E" stroke-width="1.2" opacity="0.85" stroke-linecap="round" stroke-linejoin="round">
            <!-- Tree left -->
            <path d="M25 110 V 60 M15 70 C20 40 40 40 30 70 M25 60 C35 30 50 50 35 80" />
            <!-- Store Building -->
            <rect x="60" y="30" width="110" height="80" rx="3" stroke="#5A5E5A" stroke-width="1.4" />
            <rect x="75" y="45" width="80" height="35" rx="1" />
            <text x="115" y="66" font-family="'Cormorant Garamond', serif" font-size="14" fill="#3A3D3A"
              text-anchor="middle" letter-spacing="3">VAYU</text>
            <rect x="95" y="80" width="40" height="30" rx="1" />
            <line x1="115" y1="80" x2="115" y2="110" />
            <!-- Tree right -->
            <path d="M185 110 V 55 M175 65 C180 35 195 40 188 70 M185 55 C195 25 205 45 192 75" />
          </svg>
        </div>
        <a href="https://maps.app.goo.gl/GdmtApHnAYBem1Cr8" target="_blank" rel="noopener noreferrer"
          class="m-directions-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span>GET DIRECTIONS</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      </div>
    </div>

    <!-- Card 5: Bottom Copyright -->
    <div class="m-foot-card m-foot-copy-card">
      <div>© 2026 VAYU. All rights reserved.</div>
      <div class="m-legal-links">
        <a href="/pages/legal.html">Privacy Policy</a>
        <span class="m-sep">|</span>
        <a href="/pages/legal.html">Terms & Conditions</a>
      </div>
    </div>
  </div>

  <div class="foot-bottom desktop-footer-view">
    <div>© 2026 VAYU. All rights reserved.</div>
    <div class="links">
      <a href="/pages/legal.html">Privacy Policy</a>
      <a href="/pages/legal.html">Terms & Conditions</a>
    </div>
  </div>
</footer>

<nav class="mobile-bottom-nav">
  <a href="/index.html" class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
      stroke-linejoin="round" class="shrink-0">
      <path d="M3 10.5 12 3l9 7.5"></path>
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"></path>
      <path d="M10 21v-7h4v7"></path>
    </svg>
    <span>HOME</span>
  </a>
  <a href="/pages/collection.html" class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
      stroke-linejoin="round" class="shrink-0">
      <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
      <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
      <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
      <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
    </svg>
    <span>COLLECTION</span>
  </a>
  <button type="button" class="mobile-menu-trigger-btn nav-item" id="mobileMenuBtn" aria-label="Open Navigation Menu">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" class="shrink-0">
      <circle cx="5" cy="6" r="1.2"></circle>
      <circle cx="5" cy="12" r="1.2"></circle>
      <circle cx="5" cy="18" r="1.2"></circle>
      <line x1="10" y1="6" x2="20" y2="6"></line>
      <line x1="10" y1="12" x2="20" y2="12"></line>
      <line x1="10" y1="18" x2="20" y2="18"></line>
    </svg>
    <span>MENU</span>
  </button>
  <a href="/pages/cart.html" class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
      stroke-linejoin="round" class="shrink-0">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
      <path d="M3 6h18"></path>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
    <span>CART</span>
  </a>
  <a href="/pages/user-profile.html" class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
      stroke-linejoin="round" class="shrink-0">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="10" r="3"></circle>
      <path d="M6 19a6 6 0 0 1 12 0"></path>
    </svg>
    <span>ACCOUNT</span>
  </a>
</nav>

<!-- MOBILE SLIDE-UP MENU POPUP -->
<div class="mobile-menu-overlay" id="mobileMenuOverlay">
  <div class="mobile-menu-sheet">
    <div class="mobile-menu-header">
      <div class="mobile-menu-brand">
        <span class="word">VAYU</span>
      </div>
      <button class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">&times;</button>
    </div>
    <div class="mobile-menu-body">
      <a href="/pages/collection.html" class="mm-collection-all">All Collections →</a>

      <!-- One <details> per category, filled from js/taxonomy.js by
           this component before core/shell.js binds the accordion. This list
           is where the taxonomy had drifted furthest: Accents and Souvenir
           were in every desktop menu but had never been added here, so
           neither category could be reached from a phone. -->
      <div class="macc">
        {#each entries as [slug, cat] (slug)}
          <details class="macc-group">
            <summary>{cat.title}</summary>
            <div class="macc-links">
              {#each subsOf(slug) as s (s.slug)}
                <a href={catHref(slug, s.slug)}>{s.label}</a>
              {/each}
              <a class="macc-all" href={catHref(slug)}>View All &rarr;</a>
            </div>
          </details>
        {/each}
      </div>

      <!-- The two houses are reachable from the desktop MENU panel, which
           does not exist below 1024px — without these two rows the store
           and the gallery pages have no route at all on a phone. -->
      <div class="mm-pages-row">
        <a href="/pages/artist.html">Designers & Artists</a>
        <a href="/pages/design-for-living.html">Design for Living</a>
        <a href="/pages/gallery.html">Gallery Vayu</a>
        <a href="/pages/press.html">Press</a>
        <a href="/pages/about.html">About Us</a>
      </div>
    </div>
  </div>
</div>
