<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; title?: string }>(), { title: '' });

defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <div v-if="modelValue" class="n8n-modal-overlay" @click.self="$emit('update:modelValue', false)">
    <div class="n8n-modal" role="dialog">
      <header v-if="title" class="n8n-modal__header">
        <h2>{{ title }}</h2>
        <button class="n8n-modal__close" type="button" aria-label="Close" @click="$emit('update:modelValue', false)">
          &times;
        </button>
      </header>
      <div class="n8n-modal__body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.n8n-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.n8n-modal {
  background: white;
  border-radius: 8px;
  min-width: 320px;
  max-width: 90vw;
  max-height: 85vh;
  overflow: auto;
  padding: 16px;
}
.n8n-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.n8n-modal__close {
  border: none;
  background: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
</style>
