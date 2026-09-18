<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RunnelButton, RunnelInput } from '@runnel/design-system';
import PropertyField from '../components/canvas/PropertyField.vue';
import { credentialsApi } from '../api/credentials.js';
import { useNodeTypesStore } from '../stores/nodeTypes.store.js';
import type { IDataObject, IDataObjectValue } from '@runnel/workflow';
import type { ICredentialRecord } from '../api/types.js';

const route = useRoute();
const router = useRouter();
const nodeTypesStore = useNodeTypesStore();

const credentialId = computed(() => String(route.params.id));
const record = ref<ICredentialRecord | null>(null);
const credentialType = computed(() => (record.value ? nodeTypesStore.credentialTypeByName(record.value.type) : undefined));

const name = ref('');
/**
 * The API never returns a credential's stored `data` — plaintext or encrypted, values never
 * leave the server (see CredentialsController). So every field starts from the credential
 * type's own default, same as creating a brand-new credential; the user re-enters real values
 * here regardless of whether this row already has some (e.g. it was a `request_credential`
 * placeholder with only its non-secret defaults, like openAiApi's `baseUrl`, pre-seeded).
 */
const data = reactive<IDataObject>({});

const loading = ref(true);
const notFound = ref(false);
const saving = ref(false);
const saved = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  await nodeTypesStore.load();
  try {
    record.value = await credentialsApi.get(credentialId.value);
    name.value = record.value.name;
    for (const property of credentialType.value?.properties ?? []) data[property.name] = property.default as IDataObjectValue;
  } catch {
    notFound.value = true;
  } finally {
    loading.value = false;
  }
});

function updateField(key: string, value: IDataObjectValue): void {
  data[key] = value;
}

async function onSave(): Promise<void> {
  error.value = null;
  saving.value = true;
  try {
    await credentialsApi.update(credentialId.value, { name: name.value, data: { ...data } });
    saved.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="auth-screen">
    <form v-if="!loading && !notFound" class="auth-form" @submit.prevent="onSave">
      <h1>Configure {{ credentialType?.displayName ?? record?.type }} credential</h1>
      <p>Enter the real values for this credential — an assistant-requested credential is a placeholder until you do.</p>
      <label>
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
      <p v-if="saved">Saved. You can close this tab and go back to the workflow.</p>
      <RunnelButton :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</RunnelButton>
      <RunnelButton variant="secondary" type="button" @click="router.push({ name: 'workflows' })">Back to workflows</RunnelButton>
    </form>

    <p v-else-if="notFound" class="auth-error">This credential no longer exists.</p>
  </div>
</template>
