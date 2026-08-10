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
  border-radius: 4px;
  padding: 6px 12px;
  border: 1px solid transparent;
  cursor: pointer;
}
.n8n-button--primary {
  background: var(--color-primary, #ff6d5a);
  color: white;
}
.n8n-button--secondary {
  background: transparent;
  border-color: currentColor;
}
</style>
