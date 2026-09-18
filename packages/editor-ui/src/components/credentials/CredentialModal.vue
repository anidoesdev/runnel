<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RunnelButton, RunnelInput, RunnelModal } from '@runnel/design-system';
import PropertyField from '../canvas/PropertyField.vue';
import { useCredentialsStore } from '../../stores/credentials.store.js';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import type { IDataObject, IDataObjectValue } from '@runnel/workflow';

const props = defineProps<{ modelValue: boolean; credentialTypeName: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [credential: { id: string; name: string }] }>();

const nodeTypesStore = useNodeTypesStore();
const credentialsStore = useCredentialsStore();

const credentialType = computed(() => nodeTypesStore.credentialTypeByName(props.credentialTypeName));
const name = ref('');
const data = reactive<IDataObject>({});
const error = ref<string | null>(null);
const saving = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    name.value = credentialType.value?.displayName ?? props.credentialTypeName;
    error.value = null;
    for (const key of Object.keys(data)) delete data[key];
    for (const property of credentialType.value?.properties ?? []) data[property.name] = property.default as IDataObjectValue;
  },
);

function updateField(key: string, value: IDataObjectValue): void {
  data[key] = value;
}

function close(): void {
  emit('update:modelValue', false);
}

async function onSave(): Promise<void> {
  error.value = null;
  saving.value = true;
  try {
    const created = await credentialsStore.create({
      name: name.value || props.credentialTypeName,
      type: props.credentialTypeName,
      data: { ...data },
    });
    emit('created', { id: created.id, name: created.name });
    close();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <RunnelModal
    :model-value="modelValue"
    :title="`New ${credentialType?.displayName ?? credentialTypeName} credential`"
    @update:model-value="close"
  >
    <label class="property-field">
      Name
      <RunnelInput v-model="name" />
    </label>

    <PropertyField
      v-for="property in credentialType?.properties ?? []"
      :key="property.name"
      :property="property"
      :model-value="data[property.name]"
      @update:model-value="(v) => updateField(property.name, v)"
    />

    <p v-if="error" class="auth-error">{{ error }}</p>
    <RunnelButton :disabled="saving" @click="onSave">{{ saving ? 'Saving…' : 'Save' }}</RunnelButton>
  </RunnelModal>
</template>
