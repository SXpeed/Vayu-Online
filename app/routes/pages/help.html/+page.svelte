<script>
  // Vayu — /pages/help.html, ported from public/pages/help.html.
  //
  // The page's own policy prose, split into the questions it was already
  // answering. The wording of every answer is unchanged — only the headings
  // are new, and they are now questions rather than section labels.
  //
  // Why it matters beyond tidiness: this is the page an assistant quotes
  // when someone asks "does Vayu ship internationally" or "what is Vayu's
  // return policy". As three paragraphs of prose under three nouns, none of
  // that was addressable. As FAQPage entries it is.
  //
  // The list below is the single source: the markup and the structured data
  // are both built from it, so an edited answer cannot appear in one and not
  // the other.
  import Seo from '#lib/components/Seo.svelte';

  const FAQ = [
    {
      q: 'What does shipping cost?',
      a: 'We offer complimentary pan-India shipping on all orders above ₹10,000. '
        + 'For orders below this value, standard shipping rates apply.',
    },
    {
      q: 'How long will my order take to arrive?',
      a: 'Made-to-order furniture typically ships within 3-5 weeks, while smaller '
        + 'in-stock items are dispatched within 3-5 business days.',
    },
    {
      q: 'Do you ship internationally?',
      a: 'International shipping is available upon request; please contact our '
        + 'support team for a custom quote.',
    },
    {
      q: 'Can I return an item?',
      a: 'We accept returns on unused, non-custom items within 7 days of delivery. '
        + 'The items must be returned in their original packaging.',
    },
    {
      q: 'Can made-to-order furniture be returned?',
      a: 'Bespoke, made-to-order furniture pieces are not eligible for returns, but '
        + 'can be exchanged if they arrive damaged or defective.',
    },
    {
      q: 'How do I start a return?',
      a: 'To initiate a return, please reach out to hello@vayu.design.',
    },
  ];

  const faqLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }).replace(/</g, '\u003c');

  const ldTag = (json) => '<script type="application/ld+json">' + json + '<\/script>';
</script>

<Seo
  title="Help & Support"
  description="Shipping, delivery, returns and exchanges at Vayu. Complimentary pan-India shipping above ₹10,000; returns accepted within 7 days of delivery."
  path="/pages/help.html"
/>

<svelte:head>
  {@html ldTag(faqLd)}
</svelte:head>

<main class="wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Help & Support</span>
    </nav>

    <!-- Inline style attributes removed: .text-document and its h3/p rules in
         styles.css already define all of this. The inline block also carried
         `border-radius: 20px` and `border: 1px solid var(--line)`, neither of
         which ever rendered — --line is transparent, and the flat-design
         layer forces `border-radius: 2px !important`, which beats an inline
         style. -->
    <section class="text-document">
        <!-- The page had no <h1> at all. .doc-title matches the h3 rule's
             family and weight at a size above it, so the page gains a real
             top-level heading without changing how the card reads. -->
        <h1 class="doc-title">Help &amp; Support</h1>
        <p>Welcome to Vayu Online. We are committed to providing you with the highest quality
            products and services. If you have any questions or concerns regarding your order,
            our policies, or our craftsmanship, you are in the right place.</p>

        {#each FAQ as { q, a }}
          <h3>{q}</h3>
          <p>{a}</p>
        {/each}
    </section>
</main>
