<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string;
    options: Array<{ label: string; value: string }>;
    disabled?: boolean;
  }>(),
  { modelValue: '', disabled: false },
);

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <select
    class="runnel-select"
    :value="modelValue"
    :disabled="disabled"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>
</template>

<style scoped>
.runnel-select {
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  padding: 6px 8px;
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  background: white;
}
</style>
