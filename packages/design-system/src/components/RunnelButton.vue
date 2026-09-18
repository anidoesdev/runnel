<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary'; disabled?: boolean }>(), {
  variant: 'primary',
  disabled: false,
});

defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    class="runnel-button"
    :class="`runnel-button--${variant}`"
    :disabled="disabled"
    @click="(event) => $emit('click', event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.runnel-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  border-radius: 999px;
  padding: 0 16px;
  border: 1px solid transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
}

.runnel-button:active:not(:disabled) {
  transform: scale(0.97);
}

.runnel-button:focus-visible {
  outline: none;
}

.runnel-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
  transform: none;
}

.runnel-button--primary {
  background: var(--color-primary, #ff6d5a);
  color: var(--color-on-primary, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

/* Same hue at 90%, matching shadcn's `hover:bg-primary/90` — hover changes color only, no
   shadow growth. */
.runnel-button--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary, #ff6d5a) 90%, transparent);
}

.runnel-button--primary:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary, #ff6d5a) 30%, transparent);
}

.runnel-button--secondary {
  background: var(--color-surface-container-lowest, #fff);
  color: var(--color-on-surface, currentColor);
  border-color: var(--color-outline-variant, currentColor);
}

.runnel-button--secondary:hover:not(:disabled) {
  background: var(--color-surface-container-high, rgba(0, 0, 0, 0.04));
  border-color: var(--color-outline, currentColor);
}

.runnel-button--secondary:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-outline, #717976) 25%, transparent);
}
</style>
