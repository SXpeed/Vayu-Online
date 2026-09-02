<script>
  /**
   * Vayu — the newsletter signup at the top of the footer.
   *
   * Was built by hand in js/boot/site-content.js: a <style> element appended
   * to <head>, a <div> with an innerHTML string, and a submit listener bound
   * after the fact. It is a component now, so the markup is prerendered with
   * the rest of the footer and there is nothing to inject.
   */
  const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

  let email = $state('');
  let note = $state('');
  let kind = $state('');

  async function subscribe(event) {
    event.preventDefault();

    if (!EMAIL_RE.test(email.trim())) {
      note = 'Please enter a valid email.';
      kind = 'error';
      return;
    }

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        note = 'Thank you — you are on the list.';
        kind = 'ok';
        email = '';
      } else {
        note = 'Could not subscribe right now.';
        kind = 'error';
      }
    } catch {
      note = 'Could not subscribe right now.';
      kind = 'error';
    }
  }
</script>

<div id="vayuNewsletter">
  <div class="nl-title">Letters from Vayu</div>
  <div class="nl-sub">New pieces, maker stories and quiet offers — once a month.</div>
  <form onsubmit={subscribe} novalidate>
    <input type="email" bind:value={email} required placeholder="Your email" autocomplete="email" aria-label="Your email" />
    <button type="submit">Subscribe</button>
  </form>
  <div class="nl-note" class:is-error={kind === 'error'} class:is-ok={kind === 'ok'} role="status" aria-live="polite">{note}</div>
</div>

<style>
  /* The !important on every border below is required, not stylistic: the
     flat-design layer in styles.css declares border-color transparent
     !important on every element, so a plain border here computes to
     transparent and never renders. Same workaround as .product. */
  #vayuNewsletter {
    max-width: 560px;
    margin: 34px auto 14px;
    padding: 26px 24px 24px;
    text-align: center;
    font-family: Jost, sans-serif;
    background: #faf8f5;
    border: 1px solid #ede6d9 !important;
    border-radius: 4px;
  }
  .nl-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: 24px;
    color: #141210;
    margin-bottom: 5px;
  }
  .nl-sub {
    font-size: 13px;
    color: #6e6a63;
    margin-bottom: 16px;
  }
  form {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  input {
    flex: 1;
    max-width: 280px;
    /* 16px because Safari on iOS zooms a focused field under it and
       does not zoom back; the height comes off the leading and padding
       instead, so the box is shorter than the 47px it was. */
    padding: 8px 12px;
    border: 1px solid #c9c0ae !important;
    border-radius: 2px;
    font: inherit;
    font-size: 16px;
    line-height: 1.35;
    color: #141210;
    background: #fff;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  input::placeholder {
    color: #8d887e;
  }
  input:focus {
    outline: none;
    border-color: #9e3a26;
    box-shadow: 0 0 0 3px rgba(158, 58, 38, 0.12);
  }
  button {
    padding: 12px 24px;
    background: #141210;
    color: #fff;
    border: 0;
    border-radius: 2px;
    font: inherit;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s ease;
  }
  button:hover {
    background: #9e3a26;
  }
  .nl-note {
    font-size: 12.5px;
    margin-top: 11px;
    min-height: 16px;
    color: #6e6a63;
  }
  .nl-note.is-error {
    color: #b03030;
  }
  .nl-note.is-ok {
    color: #1e6b1e;
  }
  @media (max-width: 480px) {
    form {
      flex-direction: column;
      align-items: center;
    }
    input {
      max-width: none;
      width: 100%;
    }
    button {
      width: 100%;
    }
  }
</style>
