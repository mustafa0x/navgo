<input data-testid="bound-selected" bind:value={selected} />

<script>
	let { selected = $bindable('fallback') } = $props()
</script>
