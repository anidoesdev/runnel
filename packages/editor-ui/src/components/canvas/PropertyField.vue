<script setup lang="ts">
import { computed } from 'vue';
import { RunnelCheckbox, RunnelInput, RunnelSelect } from '@runnel/design-system';
import type { IDataObject, IDataObjectValue, INodeProperties, INodePropertyOptions } from '@runnel/workflow';

defineOptions({ name: 'PropertyField' });

const props = defineProps<{ property: INodeProperties; modelValue: IDataObjectValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: IDataObjectValue] }>();

const value = computed<IDataObjectValue>(() =>
  props.modelValue === undefined ? (props.property.default as IDataObjectValue) : props.modelValue,
);

function update(next: IDataObjectValue): void {
  emit('update:modelValue', next);
}

/** `options`/`multiOptions` use INodePropertyOptions[]; `fixedCollection`/`collection` use nested INodeProperties[] — see node.interfaces.ts. */
const selectOptions = computed(() =>
  ((props.property.options as INodePropertyOptions[] | undefined) ?? []).map((option) => ({
    label: option.name,
    value: String(option.value),
  })),
);

const subProperties = computed(() => (props.property.options as INodeProperties[] | undefined) ?? []);

const multiOptions = computed(() => (props.property.options as INodePropertyOptions[] | undefined) ?? []);

const rows = computed<IDataObject[]>(() => {
  const container = value.value as IDataObject | undefined;
  return (container?.values as IDataObject[] | undefined) ?? [];
});

function addRow(): void {
  const row: IDataObject = {};
  for (const sub of subProperties.value) row[sub.name] = sub.default as IDataObjectValue;
  update({ values: [...rows.value, row] });
}

function removeRow(index: number): void {
  update({ values: rows.value.filter((_, i) => i !== index) });
}

function updateRow(index: number, key: string, rowValue: IDataObjectValue): void {
  update({ values: rows.value.map((row, i) => (i === index ? { ...row, [key]: rowValue } : row)) });
}

function isChecked(optionValue: string | number | boolean): boolean {
  return Array.isArray(value.value) && (value.value as Array<string | number | boolean>).includes(optionValue);
}

function toggleMultiOption(optionValue: string | number | boolean, checked: boolean): void {
  const current = Array.isArray(value.value) ? [...(value.value as Array<string | number | boolean>)] : [];
  update(checked ? [...current, optionValue] : current.filter((v) => v !== optionValue));
}
</script>

<template>
  <div class="property-field">
    <label>{{ property.displayName }}<span v-if="property.required" class="property-field__required" aria-hidden="true"> *</span></label>

    <RunnelInput
      v-if="property.type === 'string' || property.type === 'dateTime' || property.type === 'color'"
      :model-value="String(value ?? '')"
      :placeholder="property.placeholder"
      @update:model-value="update"
    />

    <RunnelInput
      v-else-if="property.type === 'number'"
      type="number"
      :model-value="String(value ?? 0)"
      @update:model-value="(v) => update(Number(v))"
    />

    <RunnelCheckbox v-else-if="property.type === 'boolean'" :model-value="Boolean(value)" @update:model-value="update" />

    <RunnelSelect v-else-if="property.type === 'options'" :model-value="String(value ?? '')" :options="selectOptions" @update:model-value="update" />

    <div v-else-if="property.type === 'multiOptions'" class="property-field__multi">
      <RunnelCheckbox
        v-for="option in multiOptions"
        :key="String(option.value)"
        :label="option.name"
        :model-value="isChecked(option.value)"
        @update:model-value="(checked) => toggleMultiOption(option.value, checked)"
      />
    </div>

    <textarea
      v-else-if="property.type === 'json'"
      class="property-field__json"
      :value="String(value ?? '')"
      @change="update(($event.target as HTMLTextAreaElement).value)"
    />

    <div v-else-if="property.type === 'fixedCollection' || property.type === 'collection'" class="property-field__rows">
      <div v-for="(row, index) in rows" :key="index" class="property-field__row">
        <PropertyField
          v-for="sub in subProperties"
          :key="sub.name"
          :property="sub"
          :model-value="row[sub.name]"
          @update:model-value="(v) => updateRow(index, sub.name, v)"
        />
        <button type="button" class="link-button" @click="removeRow(index)">Remove</button>
      </div>
      <button type="button" class="link-button" @click="addRow">+ Add</button>
    </div>

    <RunnelInput v-else :model-value="String(value ?? '')" @update:model-value="update" />
  </div>
</template>
