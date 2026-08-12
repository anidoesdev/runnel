<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string | number;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { modelValue: '', type: 'text', placeholder: '', disabled: false },
);

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <input
    class="n8n-input"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.n8n-input {
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  padding: 6px 8px;
  font: inherit;
  width: 100%;
  box-sizing: border-box;
}
.n8n-input:disabled {
  background: #f5f5f5;
}
</style>
