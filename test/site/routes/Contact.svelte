<svelte:head>
  <title>Contact — Navgo</title>
  <meta name="description" content="Contact form demo with basic validation" />
</svelte:head>

<h1 class="mb-4 text-2xl font-semibold">Contact</h1>

{#if submitted}
    <div class="rounded-md border border-green-300 bg-green-50 p-4 text-green-900">
        <p class="font-medium">Thanks! Your message was not actually sent (demo).</p>
        <p class="mt-2 text-sm opacity-80">We received:</p>
        <ul class="mt-2 list-inside list-disc text-sm opacity-80">
            <li><strong>Name:</strong> {name}</li>
            <li><strong>Email:</strong> {email}</li>
            {#if subject}<li><strong>Subject:</strong> {subject}</li>{/if}
            {#if message}<li><strong>Message:</strong> {message}</li>{/if}
        </ul>
        <button
            class="mt-4 inline-flex items-center rounded bg-green-600 px-3 py-1.5 text-white hover:bg-green-700"
            onclick={reset}>Send another</button
        >
    </div>
{:else}
    <form class="max-w-xl space-y-4" onsubmit={onSubmit} novalidate>
        {#if error}
            <div class="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">{error}</div>
        {/if}

        <div>
            <label class="block text-sm font-medium" for="name">Name</label>
            <input
                id="name"
                type="text"
                class="mt-1 w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                bind:value={name}
                placeholder="Ada Lovelace"
                required
            />
        </div>

        <div>
            <label class="block text-sm font-medium" for="email">Email</label>
            <input
                id="email"
                type="email"
                class="mt-1 w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                bind:value={email}
                placeholder="ada@example.com"
                required
            />
        </div>

        <div>
            <label class="block text-sm font-medium" for="subject"
                >Subject <span class="opacity-60">(optional)</span></label
            >
            <input
                id="subject"
                type="text"
                class="mt-1 w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                bind:value={subject}
                placeholder="Hello"
            />
        </div>

        <div>
            <label class="block text-sm font-medium" for="message">Message</label>
            <textarea
                id="message"
                rows="5"
                class="mt-1 w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                bind:value={message}
                placeholder="Write your message..."
                required
            ></textarea>
        </div>

        <div class="pt-2">
            <button
                type="submit"
                class="inline-flex items-center rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                >Send</button
            >
        </div>
    </form>
{/if}

<script>
let name = $state('')
let email = $state('')
let subject = $state('')
let message = $state('')
let submitted = $state(false)
let error = $state('')

function reset() {
    name = ''
    email = ''
    subject = ''
    message = ''
    error = ''
    submitted = false
}

function onSubmit() {
    error = ''

    if (!name.trim()) {
        error = 'Please enter your name.'
        return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error = 'Please enter a valid email.'
        return
    }
    if (!message.trim()) {
        error = 'Please enter a message.'
        return
    }

    // Demo only — no network request
    submitted = true
}
</script>
