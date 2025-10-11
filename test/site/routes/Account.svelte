<h1 class="mb-2 text-2xl font-semibold">Account</h1>
<p class="mb-4 opacity-80">
    This route demonstrates a simple confirmation guard via <code>beforeRouteLeave</code>.
</p>

<label class="inline-flex items-center gap-2 text-sm">
    <input type="checkbox" bind:checked={protect} />
    Protect navigation away from this page (asks for confirmation)
    <span class="opacity-60">— affects link/goto and popstate</span>
</label>

<script module>
// opt-in guard flag; toggled via component state and reflected on window for demo simplicity
export function beforeRouteLeave(nav) {
    if (!window['__account_protect']) return
    // Cancel SPA navigations and tab close/reload
    if (nav.willUnload || nav.type === 'link' || nav.type === 'nav' || nav.type === 'popstate') {
        // For SPA navigations, we can ask interactively. For unload, router will show native confirm.
        if (!nav.willUnload && !confirm('You have unsaved changes. Leave this page?')) nav.cancel()
        if (nav.willUnload) nav.cancel()
    }
}
</script>

<script>
let protect = $state(false)
$effect(() => {
    window['__account_protect'] = protect
})
</script>
