<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	type Flight = {
		id: number;
		startX: number;
		startY: number;
		endX: number;
		endY: number;
		arcY: number;
	};
	let flights = $state<Flight[]>([]);
	let nextId = 0;
	// Animation handles are only used to cancel effects when the match unmounts.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pulses = new Set<Animation>();

	export function launch(from: Element | null, to: Element | null) {
		if (!from || !to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const start = from.getBoundingClientRect();
		const end = to.getBoundingClientRect();
		const startX = start.left + start.width / 2;
		const startY = start.top + start.height / 2;
		const endX = end.left + end.width / 2;
		const endY = end.top + end.height / 2;
		flights = [
			...flights.slice(-23),
			{
				id: nextId++,
				startX,
				startY,
				endX,
				endY,
				arcY: Math.max(24, (startY + endY) / 2 - Math.min(80, Math.abs(endX - startX) / 4 + 20))
			}
		];
		const pulse = to.animate(
			[
				{ transform: 'scale(1)', boxShadow: '0 0 0 0 rgb(239 68 68 / 0)' },
				{ transform: 'scale(1.12)', boxShadow: '0 0 0 8px rgb(239 68 68 / .3)', offset: 0.3 },
				{ transform: 'scale(1)', boxShadow: '0 0 0 20px rgb(239 68 68 / 0)' }
			],
			{ duration: 350, delay: 460, easing: 'ease-out' }
		);
		pulses.add(pulse);
		void pulse.finished.then(() => pulses.delete(pulse)).catch(() => pulses.delete(pulse));
	}

	onMount(() => {
		const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const stopMotion = () => {
			if (!preference.matches) return;
			flights = [];
			pulses.forEach((pulse) => pulse.cancel());
		};
		preference.addEventListener('change', stopMotion);
		return () => preference.removeEventListener('change', stopMotion);
	});
	onDestroy(() => pulses.forEach((pulse) => pulse.cancel()));
</script>

<div class="attack-effects" aria-hidden="true">
	{#each flights as flight (flight.id)}
		<div
			class="attack-flight"
			data-testid="attack-projectile"
			style:--start-x="{flight.startX}px"
			style:--start-y="{flight.startY}px"
			style:--end-x="{flight.endX}px"
			style:--end-y="{flight.endY}px"
			style:--mid-x="{(flight.startX + flight.endX) / 2}px"
			style:--arc-y="{flight.arcY}px"
			onanimationend={() => {
				flights = flights.filter((item) => item.id !== flight.id);
			}}
		>
			<svg viewBox="0 0 32 32" width="28" height="28" fill="none">
				<path
					d="M16 2v7m0 14v7M2 16h7m14 0h7M6 6l5 5m10 10 5 5M6 26l5-5m10-10 5-5"
					stroke="#f87171"
					stroke-width="3"
					stroke-linecap="round"
				/>
				<circle cx="16" cy="16" r="9" fill="#18181b" stroke="#f87171" stroke-width="2" />
				<circle cx="13" cy="13" r="3" fill="#fff" />
			</svg>
		</div>
	{/each}
</div>

<style>
	.attack-effects {
		position: fixed;
		inset: 0;
		z-index: 60;
		overflow: clip;
		pointer-events: none;
	}
	.attack-flight {
		position: absolute;
		left: -14px;
		top: -14px;
		filter: drop-shadow(0 0 5px #ef4444) drop-shadow(0 0 14px #ef444480);
		animation: mine-flight 520ms cubic-bezier(0.3, 0, 0.65, 1) both;
		will-change: transform, opacity;
	}
	.attack-flight::before,
	.attack-flight::after {
		content: '';
		position: absolute;
		inset: 8px;
		border-radius: 50%;
		background: #f87171;
		box-shadow: 0 0 12px #ef4444;
		z-index: -1;
	}
	.attack-flight::before {
		transform: translateX(-10px);
		opacity: 0.5;
	}
	.attack-flight::after {
		transform: translateX(-20px) scale(0.5);
		opacity: 0.25;
	}
	@keyframes mine-flight {
		0% {
			transform: translate(var(--start-x), var(--start-y)) scale(0.35) rotate(-45deg);
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		48% {
			transform: translate(var(--mid-x), var(--arc-y)) scale(1.15) rotate(90deg);
			opacity: 1;
		}
		88% {
			opacity: 1;
		}
		100% {
			transform: translate(var(--end-x), var(--end-y)) scale(0.45) rotate(225deg);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.attack-flight {
			display: none;
			animation: none;
		}
	}
</style>
