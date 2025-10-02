<h1 class="text-2xl font-semibold mb-2">Account</h1>
<p class="opacity-80 mb-4">This route demonstrates a simple confirmation guard via <code>beforeNavigate</code>.</p>

<label class="inline-flex items-center gap-2 text-sm">
  <input type="checkbox" bind:checked={protect} />
  Protect navigation away from this page (asks for confirmation)
  <span class="opacity-60">— affects link/goto and popstate</span>
  </label>

<script module>
  // opt-in guard flag; toggled via component state and reflected on window for demo simplicity
  export function beforeNavigate(nav) {
    if (!window['__account_protect']) return
    if (nav.type === 'link' || nav.type === 'goto' || nav.type === 'popstate') {
      if (!confirm('You have unsaved changes. Leave this page?')) nav.cancel()
    }
  }
</script>

<script>
  let protect = $state(false)
  $effect(() => { window['__account_protect'] = protect })
</script>
