<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary'; disabled?: boolean }>(), {
  variant: 'primary',
  disabled: false,
});

defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    class="n8n-button"
    :class="`n8n-button--${variant}`"
    :disabled="disabled"
    @click="(event) => $emit('click', event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.n8n-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  padding: 8px 18px;
  border: 1px solid transparent;
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
}

.n8n-button:active:not(:disabled) {
  transform: scale(0.97);
}

.n8n-button:focus-visible {
  outline: none;
}

.n8n-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
  transform: none;
}

.n8n-button--primary {
  background: var(--color-primary, #ff6d5a);
  color: var(--color-on-primary, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.n8n-button--primary:hover:not(:disabled) {
  background: var(--color-secondary, var(--color-primary, #ff6d5a));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.n8n-button--primary:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary, #ff6d5a) 30%, transparent);
}

.n8n-button--secondary {
  background: var(--color-surface-container-lowest, #fff);
  color: var(--color-on-surface, currentColor);
  border-color: var(--color-outline-variant, currentColor);
}

.n8n-button--secondary:hover:not(:disabled) {
  background: var(--color-surface-container-high, rgba(0, 0, 0, 0.04));
  border-color: var(--color-outline, currentColor);
}

.n8n-button--secondary:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-outline, #717976) 25%, transparent);
}
</style>
