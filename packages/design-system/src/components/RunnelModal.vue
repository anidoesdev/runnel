<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; title?: string }>(), { title: '' });

defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <div v-if="modelValue" class="runnel-modal-overlay" @click.self="$emit('update:modelValue', false)">
    <div class="runnel-modal" role="dialog">
      <button class="runnel-modal__close" type="button" aria-label="Close" @click="$emit('update:modelValue', false)">
        &times;
      </button>
      <header v-if="title || $slots.header" class="runnel-modal__header">
        <slot name="header">
          <h2>{{ title }}</h2>
        </slot>
      </header>
      <div class="runnel-modal__body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.runnel-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.runnel-modal {
  position: relative;
  background: white;
  border-radius: 8px;
  min-width: 320px;
  max-width: 90vw;
  max-height: 85vh;
  overflow: auto;
  padding: 16px;
}
.runnel-modal__header {
  margin-bottom: 12px;
  padding-right: 24px;
}
.runnel-modal__header h2 {
  margin: 0;
}
.runnel-modal__close {
  position: absolute;
  top: 12px;
  right: 12px;
  border: none;
  background: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}
</style>
